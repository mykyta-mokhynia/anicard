import { Telegraf } from 'telegraf';
import { selectQuery } from '../db';

/**
 * Структура опций для подсчета очков
 * Индекс соответствует option_id в Telegram опроснике
 */
const CLAN_BATTLES_SCORES = [6, 4, 3, 2, 1, 0]; // Вин Вин, Вин Ничья, Вин Луз, Ничья Ничья, Ничья Луз, Луз Луз
const DEMON_BATTLES_SCORES = [10, 7, 5, 4, 2, 0]; // Вин Вин, Вин Ничья, Вин Луз, Ничья Ничья, Ничья Луз, Луз Луз

interface TopUser {
  userId: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  totalPoints: number;
}

/**
 * Получает группы с включенным топом
 */
export async function getGroupsWithTopEnabled(): Promise<Array<{ 
  groupId: number; 
  topicId: number; 
  topicName?: string 
}>> {
  const query = `
    SELECT DISTINCT
      tf.group_id AS group_id,
      tf.topic_id AS topic_id,
      gt.topic_name AS topic_name
    FROM topic_features tf
    INNER JOIN group_topics gt ON gt.group_id = tf.group_id AND gt.topic_id = tf.topic_id
    WHERE tf.feature_top = 1
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
 * Подсчитывает очки пользователя за определенную дату
 */
async function calculateUserPoints(
  userId: number,
  groupId: number,
  pollDate: Date
): Promise<number> {
  const dateStr = pollDate.toISOString().split('T')[0]; // YYYY-MM-DD

  // Получаем все ответы пользователя за день
  const query = `
    SELECT 
      p.poll_type,
      pa.option_ids
    FROM poll_answers pa
    INNER JOIN polls p ON p.id = pa.poll_id
    WHERE pa.user_id = ? 
      AND p.group_id = ?
      AND pa.poll_date = ?
  `;

  const answers = await selectQuery(query, [userId, groupId, dateStr]);

  let totalPoints = 0;

  for (const answer of answers) {
    const pollType = answer.pollType || answer.poll_type;
    let optionIds: number[] = [];
    
    try {
      const optionIdsStr = answer.optionIds || answer.option_ids;
      if (optionIdsStr) {
        // Если это уже массив, используем его напрямую
        if (Array.isArray(optionIdsStr)) {
          optionIds = optionIdsStr;
        } else if (typeof optionIdsStr === 'string') {
          // Если это строка, пытаемся распарсить JSON
          const parsed = JSON.parse(optionIdsStr);
          if (Array.isArray(parsed)) {
            optionIds = parsed;
          }
        }
      }
    } catch (error) {
      console.warn(`[TopService] Error parsing optionIds for user ${userId}, date ${dateStr}:`, error);
      // Продолжаем обработку других ответов
      continue;
    }

    // Определяем массив очков в зависимости от типа опросника
    const scores = pollType === 'clan_battles' ? CLAN_BATTLES_SCORES : DEMON_BATTLES_SCORES;

    // Суммируем очки за выбранные варианты
    // Если пользователь выбрал несколько вариантов, берем максимальный (обычно выбирают один)
    let maxPoints = 0;
    for (const optionId of optionIds) {
      if (typeof optionId === 'number' && optionId >= 0 && optionId < scores.length) {
        maxPoints = Math.max(maxPoints, scores[optionId]);
      }
    }
    totalPoints += maxPoints;
  }

  return totalPoints;
}

/**
 * Получает информацию о пользователях из базы данных
 */
async function getUserInfo(
  userId: number,
  groupId: number
): Promise<{ firstName?: string; lastName?: string; username?: string }> {
  // Получаем информацию о пользователе из group_members
  // Включаем всех пользователей, кроме тех, кто вышел (status != 'left')
  // Это нужно, чтобы показывать имена пользователей со статусом 'off' или других статусов
  const query = `
    SELECT first_name, last_name, username
    FROM group_members
    WHERE user_id = ? AND group_id = ? AND status != 'left'
    LIMIT 1
  `;

  const result = await selectQuery(query, [userId, groupId], false);
  
  if (!result) {
    return {};
  }

  return {
    firstName: result.firstName || result.first_name || undefined,
    lastName: result.lastName || result.last_name || undefined,
    username: result.username || undefined,
  };
}

/**
 * Получает топ пользователей за день
 */
export async function getDailyTop(
  groupId: number,
  pollDate: Date
): Promise<TopUser[]> {
  const dateStr = pollDate.toISOString().split('T')[0];

  // Получаем всех пользователей, которые ответили на опросники за день
  const query = `
    SELECT DISTINCT
      pa.user_id AS user_id
    FROM poll_answers pa
    INNER JOIN polls p ON p.id = pa.poll_id
    WHERE p.group_id = ?
      AND pa.poll_date = ?
  `;

  const users = await selectQuery(query, [groupId, dateStr]);

  // Подсчитываем очки для каждого пользователя
  const topUsers: TopUser[] = [];

  for (const user of users) {
    const userId = user.userId || user.user_id;
    const points = await calculateUserPoints(userId, groupId, pollDate);
    const userInfo = await getUserInfo(userId, groupId);

    topUsers.push({
      userId,
      firstName: userInfo.firstName,
      lastName: userInfo.lastName,
      username: userInfo.username,
      totalPoints: points,
    });
  }

  // Сортируем по очкам (от большего к меньшему)
  topUsers.sort((a, b) => b.totalPoints - a.totalPoints);

  return topUsers;
}

/**
 * Подсчитывает очки пользователя за период (несколько дней)
 */
export async function calculateUserPointsForPeriod(
  userId: number,
  groupId: number,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  // Получаем все ответы пользователя за период
  const query = `
    SELECT 
      p.poll_type,
      pa.option_ids
    FROM poll_answers pa
    INNER JOIN polls p ON p.id = pa.poll_id
    WHERE pa.user_id = ? 
      AND p.group_id = ?
      AND pa.poll_date >= ?
      AND pa.poll_date <= ?
  `;

  const answers = await selectQuery(query, [userId, groupId, startDateStr, endDateStr]);

  let totalPoints = 0;

  for (const answer of answers) {
    const pollType = answer.pollType || answer.poll_type;
    let optionIds: number[] = [];
    
    try {
      const optionIdsStr = answer.optionIds || answer.option_ids;
      if (optionIdsStr) {
        if (Array.isArray(optionIdsStr)) {
          optionIds = optionIdsStr;
        } else if (typeof optionIdsStr === 'string') {
          const parsed = JSON.parse(optionIdsStr);
          if (Array.isArray(parsed)) {
            optionIds = parsed;
          }
        }
      }
    } catch (error) {
      console.warn(`[TopService] Error parsing optionIds for user ${userId}, period ${startDateStr} - ${endDateStr}:`, error);
      continue;
    }

    const scores = pollType === 'clan_battles' ? CLAN_BATTLES_SCORES : DEMON_BATTLES_SCORES;

    let maxPoints = 0;
    for (const optionId of optionIds) {
      if (typeof optionId === 'number' && optionId >= 0 && optionId < scores.length) {
        maxPoints = Math.max(maxPoints, scores[optionId]);
      }
    }
    totalPoints += maxPoints;
  }

  return totalPoints;
}

/**
 * Получает топ пользователей за неделю (последние 7 дней)
 */
export async function getWeeklyTop(
  groupId: number,
  endDate: Date // Последний день недели (вчерашний день)
): Promise<TopUser[]> {
  // Вычисляем дату начала недели (7 дней назад от endDate)
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 6); // 7 дней включая endDate

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  // Получаем всех пользователей, которые ответили на опросники за период
  const query = `
    SELECT DISTINCT
      pa.user_id AS user_id
    FROM poll_answers pa
    INNER JOIN polls p ON p.id = pa.poll_id
    WHERE p.group_id = ?
      AND pa.poll_date >= ?
      AND pa.poll_date <= ?
  `;

  const users = await selectQuery(query, [groupId, startDateStr, endDateStr]);

  // Подсчитываем очки для каждого пользователя за весь период
  const topUsers: TopUser[] = [];
  const userPointsMap = new Map<number, number>();

  for (const user of users) {
    const userId = user.userId || user.user_id;
    
    // Если уже подсчитали очки для этого пользователя, пропускаем
    if (userPointsMap.has(userId)) {
      continue;
    }

    const points = await calculateUserPointsForPeriod(userId, groupId, startDate, endDate);
    userPointsMap.set(userId, points);

    const userInfo = await getUserInfo(userId, groupId);

    topUsers.push({
      userId,
      firstName: userInfo.firstName,
      lastName: userInfo.lastName,
      username: userInfo.username,
      totalPoints: points,
    });
  }

  // Сортируем по очкам (от большего к меньшему)
  topUsers.sort((a, b) => b.totalPoints - a.totalPoints);

  return topUsers;
}

/**
 * Форматирует имя пользователя для отображения (без упоминания)
 */
function formatUserName(user: TopUser): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  if (user.firstName) {
    return user.firstName;
  }
  if (user.username) {
    return user.username;
  }
  return `ID: ${user.userId}`;
}

/**
 * Формирует сообщение с топом за день
 */
function formatTopMessage(topUsers: TopUser[], date: Date): string {
  const dateStr = date.toLocaleDateString('ru-RU', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });

  let message = `🏆 <b>Топ за день ${dateStr}</b>\n\n`;

  if (topUsers.length === 0) {
    message += 'Нет данных за этот день.';
    return message;
  }

  const medals = ['🥇', '🥈', '🥉'];
  
  topUsers.forEach((user, index) => {
    const medal = index < 3 ? medals[index] : `${index + 1}.`;
    const userName = formatUserName(user);
    message += `${medal} ${userName} — ${user.totalPoints} очков\n`;
  });

  return message;
}

/**
 * Формирует сообщение с топом за неделю
 */
function formatWeeklyTopMessage(topUsers: TopUser[], startDate: Date, endDate: Date): string {
  const startDateStr = startDate.toLocaleDateString('ru-RU', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
  const endDateStr = endDate.toLocaleDateString('ru-RU', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });

  let message = `🏆 <b>Топ за неделю (${startDateStr} - ${endDateStr})</b>\n\n`;

  if (topUsers.length === 0) {
    message += 'Нет данных за этот период.';
    return message;
  }

  const medals = ['🥇', '🥈', '🥉'];
  
  topUsers.forEach((user, index) => {
    const medal = index < 3 ? medals[index] : `${index + 1}.`;
    const userName = formatUserName(user);
    message += `${medal} ${userName} — ${user.totalPoints} очков\n`;
  });

  return message;
}

/**
 * Отправляет топ за день в указанную тему
 */
export async function sendDailyTop(
  bot: Telegraf,
  groupId: number,
  topicId: number,
  date: Date
): Promise<void> {
  try {
    console.log(`[TopService] Calculating daily top for group ${groupId}, topic ${topicId}, date ${date.toISOString().split('T')[0]}`);

    const topUsers = await getDailyTop(groupId, date);
    const message = formatTopMessage(topUsers, date);

    const messageOptions: any = {
      parse_mode: 'HTML',
    };

    // Если topicId = 1, это общий чат, не передаем message_thread_id
    if (topicId !== 1) {
      messageOptions.message_thread_id = topicId;
    }

    await bot.telegram.sendMessage(groupId, message, messageOptions);
    console.log(`[TopService] ✅ Sent daily top for group ${groupId}, topic ${topicId}`);
  } catch (error: any) {
    console.error(`[TopService] ❌ Error sending daily top for group ${groupId}, topic ${topicId}:`, error.message);
    throw error;
  }
}

/**
 * Отправляет топ за неделю в указанную тему
 */
export async function sendWeeklyTop(
  bot: Telegraf,
  groupId: number,
  topicId: number,
  endDate: Date // Последний день недели (вчерашний день)
): Promise<void> {
  try {
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6); // 7 дней включая endDate
    
    console.log(`[TopService] Calculating weekly top for group ${groupId}, topic ${topicId}, period ${startDate.toISOString().split('T')[0]} - ${endDate.toISOString().split('T')[0]}`);

    const topUsers = await getWeeklyTop(groupId, endDate);
    const message = formatWeeklyTopMessage(topUsers, startDate, endDate);

    const messageOptions: any = {
      parse_mode: 'HTML',
    };

    // Если topicId = 1, это общий чат, не передаем message_thread_id
    if (topicId !== 1) {
      messageOptions.message_thread_id = topicId;
    }

    await bot.telegram.sendMessage(groupId, message, messageOptions);
    console.log(`[TopService] ✅ Sent weekly top for group ${groupId}, topic ${topicId}`);
  } catch (error: any) {
    console.error(`[TopService] ❌ Error sending weekly top for group ${groupId}, topic ${topicId}:`, error.message);
    throw error;
  }
}

/**
 * Отправляет топ за вчерашний день для всех групп с включенным топом
 * @deprecated Используется только для обратной совместимости. 
 * Рекомендуется использовать executeDailyTopIfNeeded из schedulerService, 
 * который учитывает часовой пояс каждой группы.
 */
export async function sendDailyTopsForAllGroups(bot: Telegraf): Promise<void> {
  try {
    const groups = await getGroupsWithTopEnabled();

    if (groups.length === 0) {
      console.log('[TopService] No groups with top enabled');
      return;
    }

    console.log(`[TopService] Found ${groups.length} group/topic(s) with top enabled`);

    const now = new Date();
    const { getGroupSettingsComplete } = await import('../types/crud/group_settings_complete_crud');
    const { getDateStringInTimezone } = await import('../utils/dateHelpers');

    for (const group of groups) {
      try {
        // Получаем часовой пояс группы
        const settings = await getGroupSettingsComplete(group.groupId);
        const groupTimezone = settings?.groupSettings?.timezone || 'Europe/Kiev';
        
        // Получаем вчерашнюю дату в часовом поясе группы
        // Получаем текущую дату в часовом поясе группы
        const todayDateStr = getDateStringInTimezone(groupTimezone);
        const todayDate = new Date(todayDateStr + 'T00:00:00');
        const yesterdayDate = new Date(todayDate);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayDateStr = getDateStringInTimezone(groupTimezone, yesterdayDate);
        const yesterday = new Date(yesterdayDateStr + 'T00:00:00');
        
        await sendDailyTop(bot, group.groupId, group.topicId, yesterday);
        console.log(`[TopService] ✅ Sent daily top for group ${group.groupId}, topic ${group.topicId} (${group.topicName || 'N/A'}), timezone: ${groupTimezone}`);
      } catch (error: any) {
        console.error(`[TopService] ❌ Error sending daily top for group ${group.groupId}, topic ${group.topicId}:`, error.message);
      }
    }

    console.log('[TopService] ✅ Daily tops task completed');
  } catch (error: any) {
    console.error('[TopService] ❌ Error in daily tops task:', error);
  }
}

