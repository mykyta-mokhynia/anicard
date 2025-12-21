import { Context, Telegraf } from 'telegraf';
import { selectQuery, executeQuery } from '../db';
import { getGroupSettingsComplete } from '../types/crud/group_settings_complete_crud';
import { getGroupDateString } from '../utils/pollDateHelpers';

interface UserNotAnsweredInfo {
  userId: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  notAnsweredClan: boolean;
  notAnsweredDemon: boolean;
}

/**
 * Получает пользователей, которые не ответили на опросники за сегодня
 * Проверяет оба типа опросников (clan_battles и demon_battles)
 * Возвращает информацию о том, какие бои не отыграны для каждого пользователя
 */
export async function getUsersNotAnsweredToday(
  groupId: number,
  topicId: number
): Promise<UserNotAnsweredInfo[]> {
  const todayDate = await getGroupDateString(groupId);
  const { selectQuery } = await import('../db');
  
  // Получаем ВСЕХ зарегистрированных пользователей, включая со статусом 'off'
  // Это нужно для напоминаний - пользователи со статусом 'off' должны получать напоминания
  const registeredUsersQuery = `
    SELECT user_id, first_name, last_name, username
    FROM group_members
    WHERE group_id = ? AND status IN ('member', 'off')
    ORDER BY first_name, username, user_id
  `;
  const registeredUsersResults = await selectQuery(registeredUsersQuery, [groupId]);
  const registeredUsers = registeredUsersResults.map((row: any) => ({
    userId: row.userId || row.user_id,
    firstName: row.firstName || row.first_name || undefined,
    lastName: row.lastName || row.last_name || undefined,
    username: row.username || undefined,
  }));
  
  if (!registeredUsers || registeredUsers.length === 0) {
    return [];
  }
  
  // Получаем ID опросников за сегодня
  const pollsQuery = `
    SELECT id, poll_type
    FROM polls
    WHERE group_id = ? 
      AND poll_date = ?
      AND poll_type IN ('clan_battles', 'demon_battles')
  `;
  
  const polls = await selectQuery(pollsQuery, [groupId, todayDate]);
  
  if (polls.length === 0) {
    // Если опросников нет, возвращаем всех зарегистрированных как не отыгравших оба боя
    return registeredUsers.map((user: { userId: number; firstName?: string; lastName?: string; username?: string }) => ({
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      notAnsweredClan: true,
      notAnsweredDemon: true,
    }));
  }
  
  // Разделяем опросники по типам
  const clanPoll = polls.find((p: any) => p.pollType === 'clan_battles' || p.poll_type === 'clan_battles');
  const demonPoll = polls.find((p: any) => p.pollType === 'demon_battles' || p.poll_type === 'demon_battles');
  
  // Получаем пользователей, которые ответили на каждый тип опросника
  const answeredClanUserIds = new Set<number>();
  const answeredDemonUserIds = new Set<number>();
  
  if (clanPoll) {
    const clanPollId = clanPoll.id;
    const answeredClanQuery = `
      SELECT DISTINCT pa.user_id
      FROM poll_answers pa
      WHERE pa.poll_id = ?
        AND pa.option_ids != '[]'
        AND pa.option_ids != ''
    `;
    const answeredClan = await selectQuery(answeredClanQuery, [clanPollId]);
    answeredClan.forEach((user: any) => {
      answeredClanUserIds.add(Number(user.userId || user.user_id));
    });
  }
  
  if (demonPoll) {
    const demonPollId = demonPoll.id;
    const answeredDemonQuery = `
      SELECT DISTINCT pa.user_id
      FROM poll_answers pa
      WHERE pa.poll_id = ?
        AND pa.option_ids != '[]'
        AND pa.option_ids != ''
    `;
    const answeredDemon = await selectQuery(answeredDemonQuery, [demonPollId]);
    answeredDemon.forEach((user: any) => {
      answeredDemonUserIds.add(Number(user.userId || user.user_id));
    });
  }
  
  // Формируем список пользователей с информацией о не отыгранных боях
  const usersNotAnswered: UserNotAnsweredInfo[] = [];
  
  for (const user of registeredUsers) {
    const notAnsweredClan = !clanPoll || !answeredClanUserIds.has(user.userId);
    const notAnsweredDemon = !demonPoll || !answeredDemonUserIds.has(user.userId);
    
    // Если хотя бы один бой не отыгран, добавляем пользователя
    if (notAnsweredClan || notAnsweredDemon) {
      usersNotAnswered.push({
        userId: user.userId,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        notAnsweredClan,
        notAnsweredDemon,
      });
    }
  }
  
  return usersNotAnswered;
}

/**
 * Форматирует список пользователей для упоминания в сообщении
 * Показывает статус каждого боя (клановый, демонический, оба)
 * Использует firstName + lastName с ссылкой по ID (без @)
 */
function formatUserList(users: UserNotAnsweredInfo[]): string {
  if (users.length === 0) {
    return '';
  }
  
  return users.map((user, index) => {
    // Формируем имя: приоритет firstName + lastName, затем username, затем "Пользователь ID"
    let displayName: string;
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
    
    // Определяем статус боёв
    let battleStatus = '';
    if (user.notAnsweredClan && user.notAnsweredDemon) {
      battleStatus = '— не отыграны клановый и демонический бои';
    } else if (user.notAnsweredClan) {
      battleStatus = '— не отыгран клановый бой';
    } else if (user.notAnsweredDemon) {
      battleStatus = '— не отыгран демонический бой';
    }
    
    // Создаем кликабельную ссылку по ID (без @) - работает как mention
    const escapedName = escapeHtml(displayName);
    return `${index + 1}. <a href="tg://user?id=${user.userId}">${escapedName}</a> ${battleStatus}`;
  }).join('\n');
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

/**
 * Удаляет старые сообщения напоминаний для группы/темы
 */
async function deleteOldReminderMessages(
  bot: Telegraf,
  groupId: number,
  topicId: number
): Promise<void> {
  try {
    // Получаем message_id старых напоминаний из bot_logs для данной группы и темы
    // Используем уникальный ключ для группы и темы
    const logKey = `reminder_${groupId}_${topicId}`;
    const query = `
      SELECT message
      FROM bot_logs
      WHERE group_id = ?
        AND action = ?
        AND DATE(created_at) = CURDATE()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const result = await selectQuery(query, [groupId, logKey], false);
    
    if (result && result.message) {
      try {
        // Парсим JSON с message_id сообщений
        const messageIds = JSON.parse(result.message);
        
        // Удаляем каждое сообщение
        for (const messageId of messageIds) {
          try {
            await bot.telegram.deleteMessage(groupId, messageId);
            console.log(`[ReminderService] ✅ Deleted old reminder message ${messageId} for group ${groupId}, topic ${topicId}`);
          } catch (deleteError: any) {
            // Игнорируем ошибки удаления (сообщение может быть уже удалено)
            if (!deleteError.response?.error_code || deleteError.response.error_code !== 400) {
              console.warn(`[ReminderService] Could not delete message ${messageId}:`, deleteError.message);
            }
          }
        }
      } catch (parseError) {
        console.warn('[ReminderService] Could not parse message IDs:', parseError);
      }
    }
  } catch (error: any) {
    console.warn('[ReminderService] Error deleting old reminder messages:', error.message);
  }
}

/**
 * Сохраняет message_id новых напоминаний в БД
 */
async function saveReminderMessages(
  groupId: number,
  topicId: number,
  messageIds: number[]
): Promise<void> {
  try {
    // Используем уникальный ключ для группы и темы
    const logKey = `reminder_${groupId}_${topicId}`;
    
    // Сначала удаляем старые записи за сегодня для этой группы и темы
    await executeQuery(
      `DELETE FROM bot_logs 
       WHERE group_id = ? 
         AND action = ? 
         AND DATE(created_at) = CURDATE()`,
      [groupId, logKey]
    );
    
    // Сохраняем новые message_id
    await executeQuery(
      `INSERT INTO bot_logs (group_id, action, message) VALUES (?, ?, ?)`,
      [groupId, logKey, JSON.stringify(messageIds)]
    );
  } catch (error: any) {
    console.error('[ReminderService] Error saving reminder messages:', error);
  }
}

/**
 * Отправляет напоминание пользователям, которые не отыграли
 * Удаляет старые напоминания перед отправкой новых
 */
export async function sendReminderToNonPlayers(
  bot: Telegraf,
  groupId: number,
  topicId: number,
  topicName?: string
): Promise<void> {
  try {
    const notAnsweredUsers = await getUsersNotAnsweredToday(groupId, topicId);
    
    if (notAnsweredUsers.length === 0) {
      console.log(`[ReminderService] All users answered for group ${groupId}, topic ${topicId}`);
      // Удаляем старые напоминания, если все отыграли
      await deleteOldReminderMessages(bot, groupId, topicId);
      return;
    }
    
    // Удаляем старые напоминания перед отправкой новых
    await deleteOldReminderMessages(bot, groupId, topicId);
    
    // Получаем настройки для определения часового пояса
    const settings = await getGroupSettingsComplete(groupId);
    const timezone = settings?.groupSettings?.timezone || 'Europe/Kiev';
    
    // Получаем текущее время в часовом поясе группы
    const now = new Date();
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const localHours = localTime.getHours();
    const localMinutes = localTime.getMinutes();
    
    // Определяем, сколько времени осталось до конца дня
    const minutesLeft = (24 - localHours) * 60 - localMinutes;
    const hoursLeft = Math.floor(minutesLeft / 60);
    const minutesLeftInHour = minutesLeft % 60;
    
    let timeRemainingText = '';
    if (hoursLeft > 0) {
      timeRemainingText = `${hoursLeft} ч${minutesLeftInHour > 0 ? ` ${minutesLeftInHour} мин` : ''}`;
    } else {
      timeRemainingText = `${minutesLeft} мин`;
    }
    
    // Разделяем пользователей на группы по 5 для правильной работы уведомлений
    const maxUsersPerMessage = 5;
    const userGroups: Array<UserNotAnsweredInfo[]> = [];
    for (let i = 0; i < notAnsweredUsers.length; i += maxUsersPerMessage) {
      userGroups.push(notAnsweredUsers.slice(i, i + maxUsersPerMessage));
    }
    
    const messageOptions: any = {
      parse_mode: 'HTML',
    };
    
    // Если topicId = 1, это общий чат, не передаем message_thread_id
    if (topicId !== 1) {
      messageOptions.message_thread_id = topicId;
    }
    
    // Сохраняем message_id всех отправленных сообщений
    const sentMessageIds: number[] = [];
    
    // Отправляем сообщения для каждой группы пользователей
    for (let i = 0; i < userGroups.length; i++) {
      const userGroup = userGroups[i];
      const userMentions = formatUserList(userGroup);
      
      const isFirstMessage = i === 0;
      const isLastMessage = i === userGroups.length - 1;
      
      let message = '';
      if (isFirstMessage) {
        message = `⏳ До конца дня осталось: ${timeRemainingText}\n\n`;
      }
      
      message += `${userMentions}`;
      
      if (isLastMessage) {
        message += `\n\nПожалуйста, отыграйте свои бои 💪`;
      }
      
      const sentMessage = await bot.telegram.sendMessage(groupId, message, messageOptions);
      sentMessageIds.push(sentMessage.message_id);
      
      if (isFirstMessage) {
        console.log(`[ReminderService] ✅ Sent reminder to ${notAnsweredUsers.length} users in group ${groupId}, topic ${topicId} (${topicName || 'N/A'}) - ${userGroups.length} message(s)`);
      }
    }
    
    // Сохраняем message_id для последующего удаления
    await saveReminderMessages(groupId, topicId, sentMessageIds);
  } catch (error: any) {
    console.error(`[ReminderService] ❌ Error sending reminder for group ${groupId}, topic ${topicId}:`, error.message);
    throw error;
  }
}

/**
 * Возвращает правильное окончание для числа пользователей
 */
function getUserCountText(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return 'человек';
  }
  
  if (lastDigit === 1) {
    return 'человек';
  } else if (lastDigit >= 2 && lastDigit <= 4) {
    return 'человека';
  } else {
    return 'человек';
  }
}

/**
 * Получает все группы с включенными опросниками (для отправки напоминаний)
 */
export async function getGroupsWithPollsEnabledForReminders(): Promise<Array<{ 
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
    WHERE tf.feature_polls = 1
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

