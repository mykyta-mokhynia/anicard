import { Context, Telegraf } from 'telegraf';
import { Markup } from 'telegraf';
import { selectQuery, executeQuery } from '../db';

interface CalloutData {
  groupId: number;
  topicId?: number;
  messageId: number;
  invitedUsers: Array<{ userId: number; username?: string; firstName?: string; lastName?: string }>;
  goingUsers: Array<{ userId: number; username?: string; firstName?: string; lastName?: string }>;
  createdAt: Date;
  battleType?: 'clan_battles' | 'demon_battles';
}

/**
 * Парсит @упоминания из текста сообщения
 */
function parseMentions(text: string, entities?: any[]): Array<{ userId?: number; username?: string; text: string }> {
  const mentions: Array<{ userId?: number; username?: string; text: string }> = [];
  
  if (!entities) {
    // Пытаемся найти @упоминания в тексте вручную
    const mentionRegex = /@(\w+)/g;
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push({
        username: match[1],
        text: match[0],
      });
    }
    return mentions;
  }
  
  // Используем entities из Telegram
  for (const entity of entities) {
    if (entity.type === 'mention') {
      const mentionText = text.substring(entity.offset, entity.offset + entity.length);
      const username = mentionText.substring(1); // Убираем @
      mentions.push({
        username,
        text: mentionText,
      });
    } else if (entity.type === 'text_mention') {
      mentions.push({
        userId: entity.user?.id,
        text: entity.user?.first_name || entity.user?.username || 'Пользователь',
      });
    }
  }
  
  return mentions;
}

/**
 * Получает информацию о пользователе по username или userId
 */
async function getUserInfo(groupId: number, userId?: number, username?: string): Promise<{ userId: number; username?: string; firstName?: string; lastName?: string } | null> {
  if (userId) {
    const query = `
      SELECT user_id, first_name, last_name, username
      FROM group_members
      WHERE user_id = ? AND group_id = ? AND status = 'member'
      LIMIT 1
    `;
    const user = await selectQuery(query, [userId, groupId], false);
    if (user) {
      return {
        userId: user.userId || user.user_id,
        username: user.username || undefined,
        firstName: user.firstName || user.first_name || undefined,
        lastName: user.lastName || user.last_name || undefined,
      };
    }
  }
  
  if (username) {
    const query = `
      SELECT user_id, first_name, last_name, username
      FROM group_members
      WHERE username = ? AND group_id = ? AND status = 'member'
      LIMIT 1
    `;
    const user = await selectQuery(query, [username, groupId], false);
    if (user) {
      return {
        userId: user.userId || user.user_id,
        username: user.username || undefined,
        firstName: user.firstName || user.first_name || undefined,
        lastName: user.lastName || user.last_name || undefined,
      };
    }
  }
  
  return null;
}

/**
 * Форматирует список пользователей для отображения с mention (кликабельные теги без @)
 * Используется для этапов сбора и готовности
 * Призыв по нику с ссылкой по ID - это работает как mention даже без username
 */
function formatUserListWithMention(users: Array<{ userId: number; username?: string; firstName?: string; lastName?: string }>): string {
  if (users.length === 0) {
    return '(пусто)';
  }
  
  return users.map((user, index) => {
    let displayName: string;
    
    // Приоритет: firstName + lastName, затем username, затем "Пользователь ID"
    if (user.firstName) {
      displayName = user.firstName;
      if (user.lastName) {
        displayName += ' ' + user.lastName;
      }
    } else if (user.username && user.username.trim() !== '') {
      displayName = user.username;
    } else {
      displayName = `Пользователь ${user.userId}`;
    }
    
    // Создаем кликабельный HTML тег БЕЗ @ (призыв по имени с ссылкой по ID - работает как mention)
    const escapedName = escapeHtml(displayName);
    return `${index + 1}. <a href="tg://user?id=${user.userId}">${escapedName}</a>`;
  }).join('\n');
}

/**
 * Форматирует список пользователей для отображения БЕЗ mention (только текст)
 * Используется для финального сообщения с кнопками
 */
function formatUserListPlainText(users: Array<{ userId: number; username?: string; firstName?: string; lastName?: string }>): string {
  if (users.length === 0) {
    return '(пусто)';
  }
  
  return users.map((user, index) => {
    let displayName: string;
    
    // Приоритет: firstName + lastName, затем username, затем "Пользователь ID"
    if (user.firstName) {
      displayName = user.firstName;
      if (user.lastName) {
        displayName += ' ' + user.lastName;
      }
    } else if (user.username && user.username.trim() !== '') {
      displayName = user.username;
    } else {
      displayName = `Пользователь ${user.userId}`;
    }
    
    // Просто текст без mention
    const escapedName = escapeHtml(displayName);
    return `${index + 1}. ${escapedName}`;
  }).join('\n');
}

/**
 * Форматирует список пользователей для отображения (с кликабельными тегами)
 * @deprecated Используйте formatUserListWithMention или formatUserListPlainText
 */
function formatUserList(users: Array<{ userId: number; username?: string; firstName?: string; lastName?: string }>): string {
  return formatUserListWithMention(users);
}

/**
 * Создает сообщение созыва из @упоминаний
 */
export async function createCalloutFromMessage(ctx: Context): Promise<void> {
  if (!ctx.message || !('text' in ctx.message) || !ctx.chat || !('id' in ctx.chat)) {
    return;
  }

  const text = ctx.message.text;
  const chatId = ctx.chat.id;
  const messageId = ctx.message.message_id;
  const topicId = 'message_thread_id' in ctx.message ? ctx.message.message_thread_id : undefined;
  
  // Парсим @упоминания
  const entities = 'entities' in ctx.message ? ctx.message.entities : undefined;
  const mentions = parseMentions(text, entities);
  
  if (mentions.length === 0) {
    return; // Нет упоминаний, не создаем созыв
  }
  
  // Получаем информацию о пользователях
  const invitedUsers: Array<{ userId: number; username?: string; firstName?: string; lastName?: string }> = [];
  
  for (const mention of mentions) {
    const userInfo = await getUserInfo(chatId, mention.userId, mention.username);
    if (userInfo) {
      // Проверяем, нет ли уже этого пользователя
      if (!invitedUsers.find(u => u.userId === userInfo.userId)) {
        invitedUsers.push(userInfo);
      }
    }
  }
  
  if (invitedUsers.length === 0) {
    return; // Не нашли ни одного пользователя
  }
  
  // Сохраняем данные созыва в БД
  const calloutId = await saveCalloutData({
    groupId: chatId,
    topicId,
    messageId,
    invitedUsers,
    goingUsers: [],
    createdAt: new Date(),
  });
  
  // Определяем тип созыва (из контекста или по умолчанию)
  const battleType = 'battleType' in ctx && ctx.battleType ? ctx.battleType : 'clan_battles';
  const battleName = battleType === 'clan_battles' ? 'клановых сражений' : 'демонических сражений';
  
  // Формируем сообщение
  const message = 
    `📢 <b>Созыв ${battleName}</b>\n\n` +
    `📋 <b>Сбор:</b>\n${formatUserList(invitedUsers)}\n\n` +
    `✅ <b>Кто идёт:</b>\n(пусто)\n\n` +
    `💡 Нажмите "Я иду", чтобы присоединиться`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('👉 Я иду', `callout:going:${calloutId}`)],
    [Markup.button.callback('📢 Созвать готовых', `callout:call:${calloutId}`)],
  ]);
  
  const messageOptions: any = {
    parse_mode: 'HTML',
    reply_markup: keyboard.reply_markup,
  };
  
  // Если topicId = 1, это общий чат, не передаем message_thread_id
  if (topicId && topicId !== 1) {
    messageOptions.message_thread_id = topicId;
  }
  
  await ctx.reply(message, messageOptions);
}

/**
 * Сохраняет данные созыва в БД
 */
async function saveCalloutData(data: CalloutData): Promise<number> {
  // Сохраняем battleType в invited_users JSON как метаданные, так как колонки в БД нет
  const invitedUsersWithMeta = {
    users: data.invitedUsers,
    battleType: data.battleType || 'clan_battles',
  };
  
  const query = `
    INSERT INTO callouts (
      group_id, 
      topic_id, 
      message_id, 
      invited_users, 
      going_users, 
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `;
  
  const invitedUsersJson = JSON.stringify(invitedUsersWithMeta);
  const goingUsersJson = JSON.stringify(data.goingUsers);
  
  await executeQuery(query, [
    data.groupId,
    data.topicId || null,
    data.messageId,
    invitedUsersJson,
    goingUsersJson,
    data.createdAt,
  ]);
  
  // Получаем ID вставленной записи
  const idQuery = `
    SELECT LAST_INSERT_ID() as id
  `;
  const idResult = await selectQuery(idQuery, [], false);
  
  return idResult?.id || 0;
}

/**
 * Обновляет данные созыва в БД
 */
async function updateCalloutData(calloutId: number, data: Partial<CalloutData>): Promise<void> {
  const updates: string[] = [];
  const values: any[] = [];
  
  if (data.invitedUsers !== undefined) {
    // Сохраняем battleType вместе с invitedUsers
    const existingCallout = await getCalloutData(calloutId);
    const battleType = data.battleType || existingCallout?.battleType || 'clan_battles';
    const invitedUsersWithMeta = {
      users: data.invitedUsers,
      battleType,
    };
    updates.push('invited_users = ?');
    values.push(JSON.stringify(invitedUsersWithMeta));
  }
  
  if (data.goingUsers !== undefined) {
    updates.push('going_users = ?');
    values.push(JSON.stringify(data.goingUsers));
  }
  
  if (updates.length === 0) {
    return;
  }
  
  values.push(calloutId);
  
  const query = `
    UPDATE callouts
    SET ${updates.join(', ')}
    WHERE id = ?
  `;
  
  await executeQuery(query, values);
}

/**
 * Получает данные созыва из БД
 */
async function getCalloutData(calloutId: number): Promise<CalloutData | null> {
  const query = `
    SELECT 
      id,
      group_id,
      topic_id,
      message_id,
      invited_users,
      going_users,
      created_at
    FROM callouts
    WHERE id = ?
    LIMIT 1
  `;
  
  const result = await selectQuery(query, [calloutId], false);
  
  if (!result) {
    return null;
  }
  
  // Парсим JSON поля, проверяя, не являются ли они уже объектами
  let invitedUsers = result.invitedUsers || result.invited_users;
  let goingUsers = result.goingUsers || result.going_users;
  let battleType: 'clan_battles' | 'demon_battles' | undefined;
  
  // Если это строка, парсим JSON, иначе используем как есть
  if (typeof invitedUsers === 'string') {
    try {
      invitedUsers = JSON.parse(invitedUsers);
    } catch (e) {
      console.error('[CalloutService] Error parsing invitedUsers JSON:', e);
      invitedUsers = [];
    }
  } else if (!invitedUsers) {
    invitedUsers = [];
  }
  
  // Проверяем, есть ли метаданные с battleType
  if (invitedUsers && typeof invitedUsers === 'object' && 'users' in invitedUsers && 'battleType' in invitedUsers) {
    battleType = invitedUsers.battleType;
    invitedUsers = invitedUsers.users;
  }
  
  if (typeof goingUsers === 'string') {
    try {
      goingUsers = JSON.parse(goingUsers);
    } catch (e) {
      console.error('[CalloutService] Error parsing goingUsers JSON:', e);
      goingUsers = [];
    }
  } else if (!goingUsers) {
    goingUsers = [];
  }
  
  return {
    groupId: result.groupId || result.group_id,
    topicId: result.topicId || result.topic_id || undefined,
    messageId: result.messageId || result.message_id,
    invitedUsers: Array.isArray(invitedUsers) ? invitedUsers : [],
    goingUsers: Array.isArray(goingUsers) ? goingUsers : [],
    createdAt: new Date(result.createdAt || result.created_at),
    battleType,
  };
}

/**
 * Создает callout из списка пользователей (для кнопки "Собрать")
 */
export async function createCalloutFromUsers(
  ctx: Context,
  groupId: number,
  topicId: number,
  users: Array<{ userId: number; firstName?: string; lastName?: string; username?: string }>,
  battleType?: 'clan_battles' | 'demon_battles'
): Promise<void> {
  if (users.length === 0) {
    return;
  }
  
  // Определяем тип созыва
  const finalBattleType = battleType || 'clan_battles';
  const battleName = finalBattleType === 'clan_battles' ? 'клановых сражений' : 'демонических сражений';
  const battleNameShort = finalBattleType === 'clan_battles' ? 'клановое' : 'демоническое';
  
  // Сохраняем данные созыва в БД
  const calloutId = await saveCalloutData({
    groupId,
    topicId,
    messageId: 0, // Не используется для callout из кнопки
    invitedUsers: users,
    goingUsers: [],
    createdAt: new Date(),
    battleType: finalBattleType,
  });
  
  // Разделяем пользователей на группы по 5 для правильной работы уведомлений
  const maxUsersPerMessage = 5;
  const userGroups: Array<typeof users> = [];
  for (let i = 0; i < users.length; i += maxUsersPerMessage) {
    userGroups.push(users.slice(i, i + maxUsersPerMessage));
  }
  
  const messageOptions: any = {
    parse_mode: 'HTML',
  };
  
  if (topicId && topicId !== 1) {
    messageOptions.message_thread_id = topicId;
  }
  
  // ЭТАП 1: Сообщение №1 (анонс)
  const announcementMessage = `📢 Созыв ${battleName}`;
  await ctx.telegram.sendMessage(groupId, announcementMessage, messageOptions);
  
  // ЭТАП 2: Сообщения со списком призванных (по 5 человек в каждом)
  for (let i = 0; i < userGroups.length; i++) {
    const userGroup = userGroups[i];
    const collectionMessage = `📋 Сбор на ${battleNameShort} сражение!\n\n${formatUserListWithMention(userGroup)}`;
    await ctx.telegram.sendMessage(groupId, collectionMessage, messageOptions);
  }
  
  // ЭТАП 3: Финальное сообщение с кнопками (ник без mention, только текст)
  const confirmationMessage = 
    `✅ Если вы идёте на ${battleNameShort} сражение — нажмите кнопку ниже\n\n` +
    `👥 Участники:\n${formatUserListPlainText([])}`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('Я иду!', `callout:going:${calloutId}`)],
    [Markup.button.callback('Созыв готовых', `callout:call:${calloutId}`)],
  ]);
  
  const confirmationMessageOptions = {
    ...messageOptions,
    reply_markup: keyboard.reply_markup,
  };
  
  await ctx.telegram.sendMessage(groupId, confirmationMessage, confirmationMessageOptions);
  
  console.log(`[CalloutService] ✅ Created callout from button for ${users.length} users in group ${groupId}, topic ${topicId} (${userGroups.length + 2} message(s))`);
}

/**
 * Обрабатывает нажатие кнопки "Я иду"
 */
export async function handleGoingButton(ctx: Context, calloutId: number): Promise<void> {
  if (!ctx.from || !ctx.chat || !('id' in ctx.chat)) {
    await ctx.answerCbQuery('❌ Ошибка');
    return;
  }
  
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  
  // Получаем данные созыва
  const callout = await getCalloutData(calloutId);
  if (!callout) {
    await ctx.answerCbQuery('❌ Созыв не найден');
    return;
  }
  
  // Проверяем, что созыв для этой группы
  if (callout.groupId !== chatId) {
    await ctx.answerCbQuery('❌ Ошибка');
    return;
  }
  
  // ВАЖНО: Проверяем, был ли пользователь призван
  const invitedIndex = callout.invitedUsers.findIndex(u => u.userId === userId);
  if (invitedIndex < 0) {
    // Пользователь не был призван
    await ctx.answerCbQuery('❌ Вы не были призваны или уже отыграли это сражение');
    return;
  }
  
  // Проверяем, есть ли пользователь уже в списке "Кто идёт"
  const goingIndex = callout.goingUsers.findIndex(u => u.userId === userId);
  if (goingIndex >= 0) {
    // Пользователь уже в списке "Кто идёт"
    await ctx.answerCbQuery('✅ Вы уже в списке!');
    return;
  }
  
  // Получаем информацию о пользователе
  const userInfo = await getUserInfo(chatId, userId, undefined);
  if (!userInfo) {
    await ctx.answerCbQuery('❌ Вы не зарегистрированы в группе');
    return;
  }
  
  // Добавляем пользователя в "Кто идёт" (НЕ удаляем из invitedUsers, т.к. он был призван)
  const newGoingUsers = [...callout.goingUsers];
  newGoingUsers.push(userInfo);
  
  // Обновляем в БД
  await updateCalloutData(calloutId, {
    goingUsers: newGoingUsers,
    battleType: callout.battleType, // Сохраняем battleType при обновлении
  });
  
  // Используем тип битвы из callout
  const battleType = callout.battleType || 'clan_battles';
  
  // Обновляем сообщение (invitedUsers не меняем, показываем всех призванных)
  await updateCalloutMessage(ctx, calloutId, callout.invitedUsers, newGoingUsers, battleType);
  
  await ctx.answerCbQuery('✅ Вы добавлены в список!');
}

/**
 * Обновляет сообщение созыва
 */
async function updateCalloutMessage(
  ctx: Context,
  calloutId: number,
  invitedUsers: Array<{ userId: number; username?: string; firstName?: string; lastName?: string }>,
  goingUsers: Array<{ userId: number; username?: string; firstName?: string; lastName?: string }>,
  battleType?: 'clan_battles' | 'demon_battles',
  showButtons: boolean = true
): Promise<void> {
  if (!ctx.callbackQuery || !('message' in ctx.callbackQuery) || !ctx.chat || !('id' in ctx.chat)) {
    return;
  }
  
  // Определяем тип созыва
  const finalBattleType = battleType || 'clan_battles';
  const battleName = finalBattleType === 'clan_battles' ? 'клановых сражений' : 'демонических сражений';
  const battleNameShort = finalBattleType === 'clan_battles' ? 'клановое' : 'демоническое';
  
  // Обновляем финальное сообщение с подтверждением (ник без mention)
  let message = 
    `✅ Если вы идёте на ${battleNameShort} сражение — нажмите кнопку ниже\n\n` +
    `👥 Участники:\n${formatUserListPlainText(goingUsers)}`;
  
  const keyboard = showButtons
    ? Markup.inlineKeyboard([
        [Markup.button.callback('Я иду!', `callout:going:${calloutId}`)],
        [Markup.button.callback('Созыв готовых', `callout:call:${calloutId}`)],
      ])
    : Markup.inlineKeyboard([]);
  
  try {
    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup,
    });
  } catch (error: any) {
    console.error('[CalloutService] Error updating message:', error);
  }
}

/**
 * Обрабатывает нажатие кнопки "Созвать готовых"
 */
export async function handleCallReadyButton(bot: Telegraf, ctx: Context, calloutId: number): Promise<void> {
  if (!ctx.from || !ctx.chat || !('id' in ctx.chat)) {
    await ctx.answerCbQuery('❌ Ошибка');
    return;
  }
  
  const chatId = ctx.chat.id;
  
  // Получаем данные созыва
  const callout = await getCalloutData(calloutId);
  if (!callout) {
    await ctx.answerCbQuery('❌ Созыв не найден');
    return;
  }
  
  // Проверяем, что созыв для этой группы
  if (callout.groupId !== chatId) {
    await ctx.answerCbQuery('❌ Ошибка');
    return;
  }
  
  if (callout.goingUsers.length === 0) {
    await ctx.answerCbQuery('❌ Нет готовых участников');
    return;
  }
  
  await ctx.answerCbQuery('📢 Созываю готовых...');
  
  // Определяем тип созыва (используем из callout, если есть, иначе дефолт)
  const battleType = callout.battleType || 'clan_battles';
  const battleName = battleType === 'clan_battles' ? 'клановым сражениям' : 'демоническим сражениям';
  const battleNameForTimer = battleType === 'clan_battles' ? 'клановой битве' : 'демонической битве';
  
  // Обновляем финальное сообщение, убирая кнопки
  try {
    if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      const message = ctx.callbackQuery.message as any;
      const battleNameShort = battleType === 'clan_battles' ? 'клановое' : 'демоническое';
      
      const updatedMessage = 
        `✅ Если вы идёте на ${battleNameShort} сражение — нажмите кнопку ниже\n\n` +
        `👥 Участники:\n${formatUserListPlainText(callout.goingUsers)}`;
      
      // Убираем все кнопки
      await ctx.telegram.editMessageText(
        chatId,
        message.message_id,
        undefined,
        updatedMessage,
        {
          parse_mode: 'HTML',
        }
      );
    }
  } catch (error: any) {
    console.error('[CalloutService] Error removing buttons from callout:', error);
  }
  
  // ЭТАП 4: Сообщения готовности (по 5 человек с mention)
  const maxUsersPerMessage = 5;
  const userGroups: Array<typeof callout.goingUsers> = [];
  for (let i = 0; i < callout.goingUsers.length; i += maxUsersPerMessage) {
    userGroups.push(callout.goingUsers.slice(i, i + maxUsersPerMessage));
  }
  
  const messageOptions: any = {
    parse_mode: 'HTML',
  };
  
  // Если topicId = 1, это общий чат, не передаем message_thread_id
  if (callout.topicId && callout.topicId !== 1) {
    messageOptions.message_thread_id = callout.topicId;
  }
  
  // Отправляем сообщения готовности для каждой группы (по 5 человек)
  for (let i = 0; i < userGroups.length; i++) {
    const userGroup = userGroups[i];
    const readinessMessage = `⏳ Готовность 10 секунд на ${battleNameForTimer}!\n\n${formatUserListWithMention(userGroup)}`;
    await bot.telegram.sendMessage(chatId, readinessMessage, messageOptions);
  }
  
  // После всех сообщений готовности запускаем отсчет в ОДНОМ сообщении
  const countdownTopicId = callout.topicId && callout.topicId !== 1 ? callout.topicId : undefined;
  await startCountdown(bot, chatId, countdownTopicId, battleNameForTimer, 10);
}

/**
 * Запускает таймер обратного отсчета (обновляет одно сообщение)
 */
async function startCountdown(
  bot: Telegraf, 
  chatId: number, 
  topicId: number | undefined, 
  battleName: string,
  seconds: number
): Promise<void> {
  const messageOptions: any = {
    parse_mode: 'HTML',
  };
  
  if (topicId && topicId !== 1) {
    messageOptions.message_thread_id = topicId;
  }
  
  // Отправляем первое сообщение с отсчетом
  let countdownMessage = await bot.telegram.sendMessage(chatId, `${seconds}`, messageOptions);
  const messageId = countdownMessage.message_id;
  
  // Обновляем сообщение каждую секунду
  for (let i = seconds - 1; i > 0; i--) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Ждем 1 секунду
    
    try {
      await bot.telegram.editMessageText(chatId, messageId, undefined, `${i}`, messageOptions);
    } catch (error: any) {
      console.error('[CalloutService] Error updating countdown:', error);
    }
  }
  
  // После последней секунды показываем подбадривающее сообщение
  await new Promise(resolve => setTimeout(resolve, 1000)); // Небольшая задержка после последней секунды
  
  const encouragementMessages = [
    '💪 Удачи в битве!',
    '⚔️ Победы!',
    '🔥 Покажите свою мощь!',
    '🏆 Пусть победит сильнейший!',
    '💥 В бой!',
    '🚀 К победе!',
    '⭐ Сражайтесь достойно!',
  ];
  
  const randomMessage = encouragementMessages[Math.floor(Math.random() * encouragementMessages.length)];
  
  try {
    // Обновляем последнее сообщение отсчета на подбадривающее
    await bot.telegram.editMessageText(chatId, messageId, undefined, randomMessage, messageOptions);
    console.log('[CalloutService] ✅ Sent encouragement message');
  } catch (error: any) {
    console.error('[CalloutService] Error sending encouragement:', error);
  }
}

/**
 * Экранирует HTML символы
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

