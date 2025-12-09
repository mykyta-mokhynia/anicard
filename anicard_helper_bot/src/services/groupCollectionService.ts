import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { selectQuery, executeQuery } from '../db';
import { getUserPollAnswers } from './pollAnswersService';

/**
 * Получает список пользователей, которые не ответили на опросник за сегодня
 * ВАЖНО: Всегда фильтрует по group_id для изоляции данных между группами
 */
export async function getUsersNotAnswered(
  ctx: Context,
  groupId: number,
  topicId: number,
  battleType: 'clan_battles' | 'demon_battles'
): Promise<Array<{ userId: number; firstName?: string; lastName?: string; username?: string }>> {
  // Получаем ID опросника за сегодня для группы (независимо от темы)
  // Опросник в день всегда один на группу
  // ВАЖНО: Фильтруем по group_id для изоляции данных между группами
  // ВАЖНО: НЕ фильтруем по topic_id, так как опросник один на группу в день
  // ВАЖНО: Используем CURDATE() для получения даты в часовом поясе сервера БД
  const pollQuery = `
    SELECT id, poll_id, topic_id, poll_date
    FROM polls 
    WHERE group_id = ? 
      AND poll_type = ?
      AND poll_date = CURDATE()
    ORDER BY id DESC
    LIMIT 1
  `;
  const poll = await selectQuery(pollQuery, [groupId, battleType], false);

  if (!poll) {
    // Проверяем, есть ли вообще опросники для этой группы сегодня (для отладки)
    const debugQuery = `
      SELECT id, poll_id, topic_id, poll_date, poll_type
      FROM polls 
      WHERE group_id = ? 
        AND poll_date = CURDATE()
      ORDER BY id DESC
    `;
    const allPollsToday = await selectQuery(debugQuery, [groupId]);
    console.log(`[GroupCollection] No poll found for today (group ${groupId}, topic ${topicId}, type ${battleType}, CURDATE() in DB)`);
    console.log(`[GroupCollection] Debug: Found ${allPollsToday.length} poll(s) for group ${groupId} today:`, allPollsToday.map((p: any) => ({
      id: p.id,
      type: p.pollType,
      topicId: p.topicId,
      date: p.pollDate
    })));
    // Если опросника нет, возвращаем всех активных участников группы
    const { getActiveGroupMembers } = await import('./groupMembersService');
    return await getActiveGroupMembers(groupId);
  }

  console.log(`[GroupCollection] ✅ Found poll for today (group ${groupId}, topic ${topicId}, type ${battleType}, poll_topic_id=${poll.topicId})`);

  // Получаем всех пользователей, которые ответили на опросник
  // ВАЖНО: poll_id уже связан с group_id через таблицу polls, поэтому изоляция данных гарантирована
  const answeredQuery = `
    SELECT DISTINCT user_id
    FROM poll_answers
    WHERE poll_id = ?
  `;
  const answeredUsers = await selectQuery(answeredQuery, [poll.id]);
  const answeredUserIds = new Set<number>(answeredUsers.map((u: any) => Number(u.userId)));

  // Получаем список всех активных участников группы из нашей БД
  // ВАЖНО: getActiveGroupMembers фильтрует по group_id
  const { getActiveGroupMembers } = await import('./groupMembersService');
  const allMembers = await getActiveGroupMembers(groupId);

  // Находим тех, кто не ответил на опросник
  const notAnswered = allMembers.filter(member => !answeredUserIds.has(member.userId));

  return notAnswered;
}

/**
 * Форматирует список неотметившихся пользователей
 */
/**
 * Экранирует специальные символы HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNotAnsweredUsers(users: Array<{ userId: number; firstName?: string; lastName?: string; username?: string }>): string {
  if (users.length === 0) {
    return '✅ Все отметились!';
  }

  const userList = users.map((user, index) => {
    let name = user.firstName || '';
    if (user.lastName) {
      name += (name ? ' ' : '') + user.lastName;
    }
    // Экранируем имя для HTML
    const escapedName = escapeHtml(name);
    if (user.username) {
      // Username экранируем тоже, но БЕЗ символа @ (чтобы не было упоминаний)
      const escapedUsername = escapeHtml(user.username);
      return `${index + 1}. ${escapedName} (${escapedUsername})`;
    }
    if (!name) {
      return `${index + 1}. Пользователь ${user.userId}`;
    }
    return `${index + 1}. ${escapedName}`;
  }).join('\n');

  return `📋 <b>Не отметились (${users.length}):</b>\n\n${userList}`;
}

/**
 * Создает сообщение "Собрать группу на клановую битву"
 */
export async function createClanBattlesCollectionMessage(
  ctx: Context,
  groupId: number,
  topicId: number
): Promise<number | null> {
  // Получаем список неотметившихся
  const notAnswered = await getUsersNotAnswered(ctx, groupId, topicId, 'clan_battles');
  const notAnsweredText = formatNotAnsweredUsers(notAnswered);

  const message = '⚔️ <b>Собрать группу на клановую битву</b>\n\n' + notAnsweredText;
  
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Собрать', `collection:collect:${topicId}:clan_battles`),
    ],
    [
      Markup.button.callback('⏰ Перенос на 10 минут', `collection:postpone:${topicId}:clan_battles`),
      Markup.button.callback('❌ Отменить', `collection:cancel:${topicId}:clan_battles`),
    ],
  ]);

  try {
    const messageOptions: any = {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup,
    };

    // Если topicId = 1, это общий чат, не передаем message_thread_id
    if (topicId !== 1) {
      messageOptions.message_thread_id = topicId;
    }

    const sentMessage = await ctx.telegram.sendMessage(groupId, message, messageOptions);

    // Сохраняем информацию о созыве в БД
    const scheduledTime = new Date();
    await saveCollectionCall(groupId, topicId, 'clan_battles', sentMessage.message_id, scheduledTime);

    console.log(`[GroupCollection] ✅ Created clan battles collection message in group ${groupId}, topic ${topicId}`);
    return sentMessage.message_id;
  } catch (error: any) {
    console.error('[GroupCollection] ❌ Error creating clan battles collection message:', error);
    return null;
  }
}

/**
 * Создает сообщение "Собрать группу на демонические сражения"
 */
export async function createDemonBattlesCollectionMessage(
  ctx: Context,
  groupId: number,
  topicId: number
): Promise<number | null> {
  // Получаем список неотметившихся
  const notAnswered = await getUsersNotAnswered(ctx, groupId, topicId, 'demon_battles');
  const notAnsweredText = formatNotAnsweredUsers(notAnswered);

  const message = '🔥 <b>Собрать группу на демонические сражения</b>\n\n' + notAnsweredText;
  
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Собрать', `collection:collect:${topicId}:demon_battles`),
    ],
    [
      Markup.button.callback('⏰ Перенос на 10 минут', `collection:postpone:${topicId}:demon_battles`),
      Markup.button.callback('❌ Отменить', `collection:cancel:${topicId}:demon_battles`),
    ],
  ]);

  try {
    const messageOptions: any = {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup,
    };

    // Если topicId = 1, это общий чат, не передаем message_thread_id
    if (topicId !== 1) {
      messageOptions.message_thread_id = topicId;
    }

    const sentMessage = await ctx.telegram.sendMessage(groupId, message, messageOptions);

    // Сохраняем информацию о созыве в БД
    const scheduledTime = new Date();
    await saveCollectionCall(groupId, topicId, 'demon_battles', sentMessage.message_id, scheduledTime);

    console.log(`[GroupCollection] ✅ Created demon battles collection message in group ${groupId}, topic ${topicId}`);
    return sentMessage.message_id;
  } catch (error: any) {
    console.error('[GroupCollection] ❌ Error creating demon battles collection message:', error);
    return null;
  }
}

/**
 * Создает оба сообщения созыва для темы
 */
export async function createCollectionMessages(
  ctx: Context,
  groupId: number,
  topicId: number
): Promise<void> {
  try {
    // Создаем сообщение для клановых битв
    await createClanBattlesCollectionMessage(ctx, groupId, topicId);
    
    // Небольшая задержка между сообщениями
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Создаем сообщение для демонических сражений
    await createDemonBattlesCollectionMessage(ctx, groupId, topicId);
    
    console.log(`[GroupCollection] ✅ Created collection messages for group ${groupId}, topic ${topicId}`);
  } catch (error: any) {
    console.error('[GroupCollection] ❌ Error creating collection messages:', error);
    throw error;
  }
}

/**
 * Получает список групп и тем, для которых включен сбор групп
 */
export async function getGroupsWithCollectionEnabled(): Promise<Array<{ groupId: number; topicId: number; topicName?: string }>> {
  const query = `
    SELECT DISTINCT
      tf.group_id AS group_id,
      tf.topic_id AS topic_id,
      gt.topic_name AS topic_name
    FROM topic_features tf
    INNER JOIN group_topics gt ON gt.group_id = tf.group_id AND gt.topic_id = tf.topic_id
    WHERE tf.feature_group_collection = 1
    ORDER BY tf.group_id, tf.topic_id
  `;

  const results = await selectQuery(query);

  const groups: Array<{ groupId: number; topicId: number; topicName?: string }> = [];
  const processed = new Set<string>();

  for (const row of results) {
    const key = `${row.groupId}_${row.topicId}`;
    if (!processed.has(key)) {
      processed.add(key);
      groups.push({
        groupId: row.groupId,
        topicId: row.topicId,
        topicName: row.topicName || undefined,
      });
    }
  }

  return groups;
}

/**
 * Сохраняет информацию о созыве в БД
 * ВАЖНО: Всегда сохраняет group_id и topic_id для изоляции данных между группами
 */
async function saveCollectionCall(
  groupId: number,
  topicId: number,
  battleType: 'clan_battles' | 'demon_battles',
  messageId: number | null,
  scheduledTime: Date
): Promise<void> {
  const query = `
    INSERT INTO group_collection_calls 
    (group_id, topic_id, battle_type, message_id, status, scheduled_time)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `;

  await executeQuery(query, [
    groupId,
    topicId,
    battleType,
    messageId,
    scheduledTime,
  ]);
}

/**
 * Обновляет статус созыва
 * ВАЖНО: Всегда фильтрует по group_id, topic_id и battle_type для изоляции данных между группами
 */
export async function updateCollectionCallStatus(
  groupId: number,
  topicId: number,
  battleType: 'clan_battles' | 'demon_battles',
  status: 'collected' | 'postponed' | 'cancelled',
  postponedUntil?: Date
): Promise<void> {
  let query = `
    UPDATE group_collection_calls
    SET status = ?, updated_at = CURRENT_TIMESTAMP
  `;
  const params: any[] = [status];

  if (postponedUntil) {
    query += `, postponed_until = ?`;
    params.push(postponedUntil);
  }

  query += `
    WHERE group_id = ? 
      AND topic_id = ? 
      AND battle_type = ?
      AND status = 'pending'
    ORDER BY id DESC
    LIMIT 1
  `;

  params.push(groupId, topicId, battleType);

  await executeQuery(query, params);
  console.log(`[GroupCollection] ✅ Updated collection call status to ${status} for group ${groupId}, topic ${topicId}, type ${battleType}`);
}

/**
 * Создает перенос на 10 минут
 */
export async function postponeCollectionCall(
  groupId: number,
  topicId: number,
  battleType: 'clan_battles' | 'demon_battles'
): Promise<Date> {
  const postponedUntil = new Date();
  postponedUntil.setMinutes(postponedUntil.getMinutes() + 10);

  await updateCollectionCallStatus(groupId, topicId, battleType, 'postponed', postponedUntil);
  return postponedUntil;
}

