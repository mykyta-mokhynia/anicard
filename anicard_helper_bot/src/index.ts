import { Telegraf } from 'telegraf';
import express from 'express';
import { config } from './config/env';
import { createTunnel } from './utils/tunnel';
import { rateLimit } from './middleware/rateLimit';
import { groupWhitelist } from './middleware/groupWhitelist';
import { handleGroupJoin } from './handlers/groupJoin';
import { registerCommands } from './services/commandService';
import { handleSettingsCallback } from './handlers/settingsCallbacks';
import { handleCollectionCallback } from './handlers/collectionCallbacks';
import { handleChatMemberUpdate } from './handlers/chatMemberUpdate';
import { handleRegistrationCallback } from './handlers/registrationCallbacks';
import { handleUsersCallback } from './handlers/usersCallbacks';
import { initPool } from './db';
import { executeQuery } from './db';
import { initScheduler } from './services/schedulerService';

const bot = new Telegraf(config.botToken);
const app = express();

// Middleware для логирования
bot.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`[${new Date().toISOString()}] ${ctx.updateType} - ${ms}ms`);
});

// Защита от DDoS - rate limiting (должен быть первым)
bot.use(rateLimit);

// Проверка разрешенных групп (whitelist)
bot.use(groupWhitelist);

// ============================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================
bot.on('my_chat_member', handleGroupJoin);


// Обработчик создания тем форума - автоматически сохраняем в БД
bot.on('forum_topic_created', async (ctx) => {
  if (!ctx.chat || !('id' in ctx.chat) || !ctx.message) {
    return;
  }

  const message = ctx.message as any;
  if (!message.message_thread_id) {
    return;
  }

  const groupId = ctx.chat.id;
  const topicId = message.message_thread_id;
  
  // В Telegraf название темы находится в message.forum_topic_created.name
  // или может быть в message.text для некоторых версий API
  let topicName = (message.forum_topic_created && message.forum_topic_created.name) ||
                  message.name ||
                  message.text ||
                  `Тема ${topicId}`;
  
  // Логируем для отладки
  console.log('[TopicsService] forum_topic_created - topicId:', topicId, 'topicName:', topicName);
  console.log('[TopicsService] message structure:', {
    hasForumTopicCreated: !!message.forum_topic_created,
    forumTopicCreatedName: message.forum_topic_created?.name,
    messageName: message.name,
    messageText: message.text,
  });

  try {
    const { getGroupTopicUpsertQuery } = await import('./crud/group_topics_crud');
    const { executeQuery } = await import('./db');

    const topic = {
      groupId,
      topicId,
      topicName: String(topicName),
    };

    const queryInfo = getGroupTopicUpsertQuery(topic);
    await executeQuery(queryInfo.query);
    console.log(`[TopicsService] ✅ Auto-saved new topic: "${topicName}" (ID: ${topicId}) in group ${groupId}`);
  } catch (error: any) {
    console.error('[TopicsService] ❌ Error auto-saving topic:', error);
  }
});

// Обработчик редактирования тем форума
bot.on('forum_topic_edited', async (ctx) => {
  if (!ctx.chat || !('id' in ctx.chat) || !ctx.message) {
    return;
  }

  const message = ctx.message as any;
  if (!message.message_thread_id) {
    return;
  }

  const groupId = ctx.chat.id;
  const topicId = message.message_thread_id;
  
  // Логируем структуру сообщения для отладки
  console.log('[TopicsService] forum_topic_edited event:', JSON.stringify(message, null, 2));
  
  // Пробуем разные варианты получения названия темы
  let topicName = message.name || 
                  message.topic_name || 
                  (message.forum_topic_edited && message.forum_topic_edited.name) ||
                  `Тема ${topicId}`;

  try {
    const { getGroupTopicUpsertQuery } = await import('./crud/group_topics_crud');
    const { executeQuery } = await import('./db');

    const topic = {
      groupId,
      topicId,
      topicName: String(topicName),
    };

    const queryInfo = getGroupTopicUpsertQuery(topic);
    await executeQuery(queryInfo.query);
    console.log(`[TopicsService] ✅ Auto-updated topic: "${topicName}" (ID: ${topicId}) in group ${groupId}`);
  } catch (error: any) {
    console.error('[TopicsService] ❌ Error auto-updating topic:', error);
  }
});

// Обработчик изменений участников группы (вход/выход) - для супергрупп
bot.on('chat_member', async (ctx) => {
  await handleChatMemberUpdate(ctx);
});

// Обработчик выхода участника из группы - для обычных групп
bot.on('left_chat_member', async (ctx) => {
  if (!ctx.message || !ctx.chat || !ctx.message.left_chat_member) {
    return;
  }

  const chat = ctx.chat;
  const chatId = chat.id;

  // Обрабатываем только группы и супергруппы
  if (chat.type !== 'group' && chat.type !== 'supergroup') {
    return;
  }

  // Проверяем, что группа в whitelist
  const { config } = await import('./config/env');
  const allowedGroups = config.allowedGroupIds;
  if (allowedGroups.length > 0 && !allowedGroups.includes(chatId)) {
    return;
  }

  const user = ctx.message.left_chat_member;
  const userId = user.id;

  // Не обрабатываем, если это сам бот
  const botInfo = await ctx.telegram.getMe();
  if (userId === botInfo.id) {
    return;
  }

  try {
    const { removeGroupMember } = await import('./services/groupMembersService');
    await removeGroupMember(chatId, userId);
    console.log(`[LeftChatMember] ✅ User ${userId} left group ${chatId} (status set to 'left')`);
  } catch (error: any) {
    console.error(`[LeftChatMember] ❌ Error handling left_chat_member for user ${userId} in group ${chatId}:`, error);
  }
});

// Обработчик ответов на опросники
bot.on('poll_answer', async (ctx) => {
  try {
    const pollAnswer = ctx.pollAnswer;
    if (!pollAnswer.user) {
      console.warn('[PollAnswer] User information not available');
      return;
    }

    const pollId = pollAnswer.poll_id;
    const userId = pollAnswer.user.id;
    const optionIds = pollAnswer.option_ids;

    // Получаем дату опросника и group_id из базы данных
    const { selectQuery } = await import('./db');
    const pollQuery = `
      SELECT poll_date, group_id FROM polls 
      WHERE poll_id = ?
      LIMIT 1
    `;
    const poll = await selectQuery(pollQuery, [pollId], false);

    if (!poll) {
      console.warn(`[PollAnswer] Poll ${pollId} not found in database`);
      return;
    }

    const groupId = poll.groupId || poll.group_id;

    // Проверяем, зарегистрирован ли пользователь, если нет - регистрируем автоматически
    const { upsertGroupMember } = await import('./services/groupMembersService');
    const memberCheckQuery = `
      SELECT user_id, status FROM group_members 
      WHERE group_id = ? AND user_id = ?
      LIMIT 1
    `;
    const existingMember = await selectQuery(memberCheckQuery, [groupId, userId], false);

    // Если пользователь не зарегистрирован или имеет статус 'left', регистрируем/восстанавливаем его
    if (!existingMember || existingMember.status === 'left') {
      // Регистрируем пользователя с данными из pollAnswer
      await upsertGroupMember(
        groupId,
        userId,
        pollAnswer.user.first_name,
        pollAnswer.user.last_name,
        pollAnswer.user.username,
        'member'
      );
      console.log(`[PollAnswer] ✅ Auto-registered user ${userId} in group ${groupId} (voted in poll)`);
    }

    // Используем дату из базы данных напрямую (она уже в формате YYYY-MM-DD)
    // poll_date хранится как DATE, поэтому может быть строкой или Date объектом
    const pollDate = poll.pollDate instanceof Date 
      ? poll.pollDate 
      : new Date(poll.pollDate + 'T00:00:00');

    // Сохраняем, обновляем или удаляем ответ
    // Если optionIds пустой массив - пользователь убрал голос, запись будет удалена
    const { savePollAnswer } = await import('./services/pollAnswersService');
    await savePollAnswer(pollId, userId, optionIds, pollDate);

    if (optionIds.length === 0) {
      console.log(`[PollAnswer] ✅ Removed answer for user ${userId} on poll ${pollId} (user removed vote)`);
    } else {
      console.log(`[PollAnswer] ✅ Saved answer for user ${userId} on poll ${pollId}: options ${optionIds.join(', ')}`);
    }
  } catch (error: any) {
    console.error('[PollAnswer] ❌ Error saving poll answer:', error);
  }
});

// Обработчик callback для меню настроек, созыва групп и регистрации
bot.on('callback_query', async (ctx, next) => {
  if ('data' in ctx.callbackQuery) {
    const data = ctx.callbackQuery.data;
    if (data.startsWith('menu:') || data.startsWith('interval:') || data.startsWith('topic:') || data.startsWith('warn:')) {
      await handleSettingsCallback(ctx);
      return;
    }
    if (data.startsWith('collection:')) {
      await handleCollectionCallback(ctx);
      return;
    }
    if (data.startsWith('registration:')) {
      await handleRegistrationCallback(ctx);
      return;
    }
    if (data.startsWith('callout:')) {
      const { handleCalloutCallback } = await import('./handlers/calloutCallbacks');
      await handleCalloutCallback(bot, ctx);
      return;
    }
    if (data.startsWith('users:')) {
      // users: обрабатывается без проверки админа, так как может быть вызван из меню
      // Проверка пользователя выполняется в handleSettingsCallback для menu:command:users
      await handleUsersCallback(ctx);
      return;
    }
    if (data.startsWith('top:')) {
      // top: обрабатывается без проверки админа, так как может быть вызван из меню
      // Проверка пользователя выполняется в handleSettingsCallback для menu:command:top
      const { topCommand } = await import('./commands/top');
      await topCommand(ctx);
      return;
    }
  }
  return next();
});

// ============================================
// РЕГИСТРАЦИЯ КОМАНД
// ============================================
registerCommands(bot);

// Обработчик текстовых сообщений
bot.on('text', async (ctx, next) => {
  // Пропускаем команды (они обрабатываются отдельно)
  if (ctx.message && 'text' in ctx.message && ctx.message.text && ctx.message.text.startsWith('/')) {
    return next();
  }

  // Проверяем, что это сообщение в группе
  if (!ctx.chat || (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup')) {
    return next();
  }

  if (!ctx.from) {
    return next();
  }

  const groupId = ctx.chat.id;
  const userId = ctx.from.id;

  // Проверяем команды "Анрег"/"unreg" и "Меню"/"menu" только для текстовых сообщений
  if ('text' in ctx.message!) {
    const messageText = ctx.message.text.trim().toLowerCase();

    // Проверяем, является ли текст командой "Анрег" или "анрег" (регистр не важен)
    if (messageText === 'анрег' || messageText === 'unreg') {
      const { unregCommand } = await import('./commands/unreg');
      await unregCommand(ctx);
      return; // Не вызываем next(), так как команда уже обработана
    }

    // Проверяем, является ли текст командой "Меню" или "menu" (регистр не важен)
    if (messageText === 'меню' || messageText === 'menu') {
      const { menuCommand } = await import('./commands/menu');
      await menuCommand(ctx);
      return; // Не вызываем next(), так как команда уже обработана
    }
  }

  try {
    // Проверяем, есть ли пользователь в БД со статусом 'off'
    // Это должно работать для всех типов сообщений (текст, фото, стикер и т.д.)
    const { selectQuery, executeQuery } = await import('./db');
    const member = await selectQuery(
      `SELECT user_id, status FROM group_members WHERE group_id = ? AND user_id = ?`,
      [groupId, userId],
      false
    );

    if (member) {
      const status = member.status || (member as any).status;
      if (status === 'off') {
        // Обновляем информацию о пользователе и переводим в статус 'member'
        const { upsertGroupMember } = await import('./services/groupMembersService');
        await upsertGroupMember(
          groupId,
          userId,
          ctx.from.first_name,
          ctx.from.last_name,
          ctx.from.username,
          'member'
        );
        console.log(`[TextHandler] ✅ User ${userId} automatically restored to 'member' status in group ${groupId}`);
      }
    }
  } catch (error: any) {
    console.error(`[TextHandler] ❌ Error checking/updating user status:`, error);
    // Не блокируем обработку сообщения при ошибке
  }

  return next();
});

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('❌ Произошла ошибка при обработке команды.');
});

// Запуск бота
async function startBot() {
  try {
    // Инициализация базы данных
    initPool();
    
    // Проверка подключения
    try {
      await executeQuery('SELECT 1', true);
      console.log('[DB] Connection successful');
    } catch (error) {
      console.error('[DB] Connection failed:', error);
      process.exit(1);
    }
    
    // Используем polling для разработки
    // Для production можно использовать webhook
    const useWebhook = process.env.USE_WEBHOOK === 'true';
    
    // Инициализируем планировщик задач (работает и для polling, и для webhook)
    initScheduler(bot);
    
    if (useWebhook) {
      // Настройка webhook через выбранный туннель
      app.use(express.json());
      app.use(bot.webhookCallback('/webhook'));
      
      console.log(`🔧 Используется провайдер туннеля: ${config.tunnelProvider}`);
      const tunnel = createTunnel(config.tunnelProvider);
      
      const tunnelUrl = await tunnel.start(config.port);
      const webhookUrl = `${tunnelUrl}/webhook`;
      
      await bot.telegram.setWebhook(webhookUrl);
      console.log(`✅ Webhook установлен: ${webhookUrl}`);
      
      app.listen(config.port, () => {
        console.log(`🚀 Server running on port ${config.port}`);
      });
      
      // Graceful shutdown
      process.once('SIGINT', async () => {
        await tunnel.stop();
        await bot.telegram.deleteWebhook();
        process.exit(0);
      });
      
      process.once('SIGTERM', async () => {
        await tunnel.stop();
        await bot.telegram.deleteWebhook();
        process.exit(0);
      });
    } else {
      // Используем polling (long polling)
      await bot.launch();
      console.log('✅ Bot started with polling');
      
      // Graceful shutdown
      process.once('SIGINT', async () => {
        await bot.stop('SIGINT');
        process.exit(0);
      });
      
      process.once('SIGTERM', async () => {
        await bot.stop('SIGTERM');
        process.exit(0);
      });
    }
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

startBot();


