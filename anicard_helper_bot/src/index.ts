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

// Обработчик изменений участников группы (вход/выход)
bot.on('chat_member', async (ctx) => {
  await handleChatMemberUpdate(ctx);
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

    // Получаем дату опросника из базы данных
    const { selectQuery } = await import('./db');
    const pollQuery = `
      SELECT poll_date FROM polls 
      WHERE poll_id = ?
      LIMIT 1
    `;
    const poll = await selectQuery(pollQuery, [pollId], false);

    if (!poll) {
      console.warn(`[PollAnswer] Poll ${pollId} not found in database`);
      return;
    }

    // Парсим дату из базы данных (может быть строкой или Date объектом)
    const pollDate = poll.pollDate instanceof Date 
      ? poll.pollDate 
      : new Date(poll.pollDate);

    // Сохраняем или обновляем ответ
    const { savePollAnswer } = await import('./services/pollAnswersService');
    await savePollAnswer(pollId, userId, optionIds, pollDate);

    console.log(`[PollAnswer] ✅ Saved answer for user ${userId} on poll ${pollId}: options ${optionIds.join(', ')}`);
  } catch (error: any) {
    console.error('[PollAnswer] ❌ Error saving poll answer:', error);
  }
});

// Обработчик callback для меню настроек, созыва групп и регистрации
bot.on('callback_query', async (ctx, next) => {
  if ('data' in ctx.callbackQuery) {
    const data = ctx.callbackQuery.data;
    if (data.startsWith('settings:') || data.startsWith('interval:') || data.startsWith('topic:')) {
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
  }
  return next();
});

// ============================================
// РЕГИСТРАЦИЯ КОМАНД
// ============================================
registerCommands(bot);

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
      
      // Инициализируем планировщик задач для ежедневных опросников
      initScheduler(bot);
      
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


