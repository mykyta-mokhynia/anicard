import { Telegraf } from 'telegraf';
import { executeQuery, selectQuery } from '../db';
import { calculateUserPointsForPeriod } from './topService';
import { getDateStringInTimezone } from '../utils/dateHelpers';

/**
 * Причины варнов
 */
export type WarnReason = 'no_kv' | 'no_play_2days' | 'no_norm';

/**
 * Интерфейс для пользователя с варнами
 */
interface UserWithWarns {
  userId: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  totalWarns: number;
  warnReasons: WarnReason[];
}

/**
 * Получает настройки варнов для группы
 */
export async function getWarnSettings(groupId: number): Promise<{
  reportGroupId?: number;
  reportTopicId?: number;
  normPoints: number;
  enabled: boolean;
} | null> {
  const query = `
    SELECT warn_report_group_id, warn_report_topic_id, norm_points, warns_enabled
    FROM group_warn_settings
    WHERE group_id = ?
    LIMIT 1
  `;

  const result = await selectQuery(query, [groupId], false);
  
  if (!result) {
    return null;
  }

  return {
    reportGroupId: result.warnReportGroupId || result.warn_report_group_id || undefined,
    reportTopicId: result.warnReportTopicId || result.warn_report_topic_id || undefined,
    normPoints: result.normPoints || result.norm_points || 90,
    enabled: result.warnsEnabled !== undefined ? (result.warnsEnabled || result.warns_enabled) : false,
  };
}

/**
 * Сохраняет или обновляет настройки варнов для группы
 */
export async function saveWarnSettings(
  groupId: number,
  reportGroupId?: number,
  reportTopicId?: number,
  normPoints: number = 90,
  enabled?: boolean
): Promise<void> {
  const query = `
    INSERT INTO group_warn_settings (group_id, warn_report_group_id, warn_report_topic_id, norm_points, warns_enabled)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      warn_report_group_id = VALUES(warn_report_group_id),
      warn_report_topic_id = VALUES(warn_report_topic_id),
      norm_points = VALUES(norm_points),
      warns_enabled = COALESCE(VALUES(warns_enabled), warns_enabled),
      updated_at = CURRENT_TIMESTAMP
  `;

  // Если enabled не указан, сохраняем текущее значение или true, если создаем новую запись
  const currentSettings = await getWarnSettings(groupId);
  const finalEnabled = enabled !== undefined ? enabled : (currentSettings?.enabled ?? true);

  await executeQuery(query, [groupId, reportGroupId || null, reportTopicId || null, normPoints, finalEnabled]);
  console.log(`[WarnService] ✅ Saved warn settings for group ${groupId} (enabled: ${finalEnabled})`);
}

/**
 * Проверяет, сыграл ли пользователь клановую войну (KV) за указанную дату
 */
async function didUserPlayClanBattles(
  userId: number,
  groupId: number,
  date: Date
): Promise<boolean> {
  const dateStr = date.toISOString().split('T')[0];

  const query = `
    SELECT COUNT(*) as count
    FROM poll_answers pa
    INNER JOIN polls p ON p.id = pa.poll_id
    WHERE pa.user_id = ?
      AND p.group_id = ?
      AND p.poll_type = 'clan_battles'
      AND pa.poll_date = ?
  `;

  const result = await selectQuery(query, [userId, groupId, dateStr], false);
  return (result?.count || 0) > 0;
}

/**
 * Проверяет, играл ли пользователь хотя бы один бой за указанную дату
 */
async function didUserPlayAnyBattle(
  userId: number,
  groupId: number,
  date: Date
): Promise<boolean> {
  const dateStr = date.toISOString().split('T')[0];

  const query = `
    SELECT COUNT(*) as count
    FROM poll_answers pa
    INNER JOIN polls p ON p.id = pa.poll_id
    WHERE pa.user_id = ?
      AND p.group_id = ?
      AND pa.poll_date = ?
  `;

  const result = await selectQuery(query, [userId, groupId, dateStr], false);
  return (result?.count || 0) > 0;
}

/**
 * Выдает варн пользователю
 */
async function giveWarn(
  groupId: number,
  userId: number,
  reason: WarnReason,
  warnDate: Date,
  periodStart?: Date,
  periodEnd?: Date
): Promise<void> {
  // Проверяем, не выдавали ли уже варн за эту причину за эту дату/период
  let checkQuery: string;
  let checkParams: any[];

  if (reason === 'no_norm' && periodStart && periodEnd) {
    // Для нормы проверяем по периоду
    checkQuery = `
      SELECT COUNT(*) as count
      FROM user_warns
      WHERE group_id = ?
        AND user_id = ?
        AND warn_reason = ?
        AND warn_period_start = ?
        AND warn_period_end = ?
    `;
    checkParams = [groupId, userId, reason, periodStart.toISOString().split('T')[0], periodEnd.toISOString().split('T')[0]];
  } else {
    // Для других причин проверяем по дате
    checkQuery = `
      SELECT COUNT(*) as count
      FROM user_warns
      WHERE group_id = ?
        AND user_id = ?
        AND warn_reason = ?
        AND warn_date = ?
    `;
    checkParams = [groupId, userId, reason, warnDate.toISOString().split('T')[0]];
  }

  const existing = await selectQuery(checkQuery, checkParams, false);
  if ((existing?.count || 0) > 0) {
    console.log(`[WarnService] ⚠️ Warn already exists for user ${userId}, reason ${reason}, date ${warnDate.toISOString().split('T')[0]}`);
    return;
  }

  const insertQuery = `
    INSERT INTO user_warns (group_id, user_id, warn_reason, warn_date, warn_period_start, warn_period_end)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  await executeQuery(insertQuery, [
    groupId,
    userId,
    reason,
    warnDate.toISOString().split('T')[0],
    periodStart ? periodStart.toISOString().split('T')[0] : null,
    periodEnd ? periodEnd.toISOString().split('T')[0] : null,
  ]);

  console.log(`[WarnService] ✅ Gave warn to user ${userId} in group ${groupId}, reason: ${reason}`);
}

/**
 * Получает общее количество варнов пользователя
 */
export async function getUserTotalWarns(
  userId: number,
  groupId: number
): Promise<number> {
  const query = `
    SELECT COUNT(*) as count
    FROM user_warns
    WHERE group_id = ? AND user_id = ?
  `;

  const result = await selectQuery(query, [groupId, userId], false);
  return result?.count || 0;
}

/**
 * Получает всех пользователей с 3 и более варнами
 */
export async function getUsersWith3Warns(groupId: number): Promise<UserWithWarns[]> {
  const query = `
    SELECT 
      uw.user_id,
      COUNT(*) as total_warns,
      GROUP_CONCAT(DISTINCT uw.warn_reason) as warn_reasons
    FROM user_warns uw
    WHERE uw.group_id = ?
    GROUP BY uw.user_id
    HAVING COUNT(*) >= 3
  `;

  const results = await selectQuery(query, [groupId]);

  const usersWithWarns: UserWithWarns[] = [];

  for (const row of results) {
    const userId = row.userId || row.user_id;
    const totalWarns = row.totalWarns || row.total_warns;
    const warnReasonsStr = row.warnReasons || row.warn_reasons;

    // Получаем информацию о пользователе
    const userQuery = `
      SELECT first_name, last_name, username
      FROM group_members
      WHERE user_id = ? AND group_id = ? AND status != 'left'
      LIMIT 1
    `;
    const userInfo = await selectQuery(userQuery, [userId, groupId], false);

    const warnReasons = warnReasonsStr ? (warnReasonsStr.split(',') as WarnReason[]) : [];

    usersWithWarns.push({
      userId,
      firstName: userInfo?.firstName || userInfo?.first_name,
      lastName: userInfo?.lastName || userInfo?.last_name,
      username: userInfo?.username,
      totalWarns,
      warnReasons,
    });
  }

  return usersWithWarns;
}

/**
 * Форматирует причину варна для отображения
 */
function formatWarnReason(reason: WarnReason): string {
  switch (reason) {
    case 'no_kv':
      return 'Не сыграл КВ';
    case 'no_play_2days':
      return 'Не играл 2 дня';
    case 'no_norm':
      return 'Не набрал норму';
    default:
      return reason;
  }
}

/**
 * Форматирует имя пользователя для отображения
 */
function formatUserName(user: UserWithWarns): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  if (user.firstName) {
    return user.firstName;
  }
  if (user.username) {
    return user.username;
  }
  return `Пользователь ${user.userId}`;
}

/**
 * Форматирует сообщение об отчете о варнах
 */
function formatWarnReportMessage(users: UserWithWarns[]): string {
  if (users.length === 0) {
    return '✅ Нет пользователей с 3 и более варнами.';
  }

  let message = `⚠️ <b>Отчет о варнах</b>\n\n`;
  message += `📊 <b>Пользователей с 3+ варнами:</b> ${users.length}\n\n`;

  for (const user of users) {
    const name = formatUserName(user);
    const reasonsText = user.warnReasons.map(r => formatWarnReason(r)).join(', ');
    
    message += `🔴 <b>${name}</b>\n`;
    message += `   • Варнов: ${user.totalWarns}\n`;
    message += `   • Причины: ${reasonsText}\n\n`;
  }

  return message;
}

/**
 * Проверяет и выдает варны для группы
 */
export async function checkAndGiveWarns(
  groupId: number,
  timezone: string
): Promise<void> {
  // Получаем вчерашнюю дату в часовом поясе группы
  const now = new Date();
  
  // Получаем вчерашнюю дату в часовом поясе группы
  const todayStr = getDateStringInTimezone(timezone);
  const today = new Date(todayStr + 'T00:00:00');
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getDateStringInTimezone(timezone, yesterday);

  // Получаем всех активных участников группы
  const membersQuery = `
    SELECT user_id, first_name, last_name, username
    FROM group_members
    WHERE group_id = ? AND status = 'member'
  `;
  const members = await selectQuery(membersQuery, [groupId]);

  for (const member of members) {
    const userId = member.userId || member.user_id;

    // 1. Проверка: не сыграл КВ за вчера = 2 варна
    const playedKV = await didUserPlayClanBattles(userId, groupId, yesterday);
    if (!playedKV) {
      await giveWarn(groupId, userId, 'no_kv', yesterday);
      await giveWarn(groupId, userId, 'no_kv', yesterday); // 2 варна
    }

    // 2. Проверка: не играл 2 дня подряд = 3 варна
    // Проверяем только если вчера был последний день без игры из двух
    const yesterdayPlayed = await didUserPlayAnyBattle(userId, groupId, yesterday);
    const twoDaysAgo = new Date(yesterday);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 1);
    const twoDaysAgoPlayed = await didUserPlayAnyBattle(userId, groupId, twoDaysAgo);

    if (!yesterdayPlayed && !twoDaysAgoPlayed) {
      // Проверяем, не выдавали ли уже варны за эти два дня
      const checkQuery = `
        SELECT COUNT(*) as count
        FROM user_warns
        WHERE group_id = ?
          AND user_id = ?
          AND warn_reason = 'no_play_2days'
          AND warn_date IN (?, ?)
      `;
      const existing = await selectQuery(checkQuery, [groupId, userId, yesterdayStr, getDateStringInTimezone(timezone, twoDaysAgo)], false);
      
      if ((existing?.count || 0) === 0) {
        // Выдаем 3 варна (один раз)
        await giveWarn(groupId, userId, 'no_play_2days', yesterday);
        await giveWarn(groupId, userId, 'no_play_2days', yesterday);
        await giveWarn(groupId, userId, 'no_play_2days', yesterday);
      }
    }

    // 3. Проверка: не набрал норму за неделю (90🔹) = 2 варна
    // Проверяем в понедельник после недели
    const todayLocal = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    if (todayLocal.getDay() === 1) { // Понедельник
      // Неделя с понедельника до воскресенья (прошлая неделя)
      const lastMonday = new Date(todayLocal);
      lastMonday.setDate(lastMonday.getDate() - 7);
      lastMonday.setHours(0, 0, 0, 0);
      
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastSunday.getDate() + 6);
      lastSunday.setHours(23, 59, 59, 999);

      // Получаем настройки для нормы
      const settings = await getWarnSettings(groupId);
      const normPoints = settings?.normPoints || 90;

      // Подсчитываем очки пользователя за прошлую неделю
      const totalPoints = await calculateUserPointsForPeriod(
        userId,
        groupId,
        lastMonday,
        lastSunday
      );

      if (totalPoints < normPoints) {
        // Выдаем 2 варна
        await giveWarn(groupId, userId, 'no_norm', today, lastMonday, lastSunday);
        await giveWarn(groupId, userId, 'no_norm', today, lastMonday, lastSunday);
      }
    }
  }
}

/**
 * Отправляет отчет о варнах в указанную группу
 */
export async function sendWarnReport(
  bot: Telegraf,
  groupId: number,
  timezone: string
): Promise<void> {
  const settings = await getWarnSettings(groupId);
  
  if (!settings || !settings.reportGroupId) {
    console.log(`[WarnService] ⚠️ No warn report settings for group ${groupId}`);
    return;
  }

  await sendWarnReportToGroup(bot, groupId, settings.reportGroupId, settings.reportTopicId, timezone);
}

/**
 * Отправляет отчет о варнах в указанную группу (вспомогательная функция)
 */
export async function sendWarnReportToGroup(
  bot: Telegraf,
  groupId: number,
  reportGroupId: number,
  reportTopicId: number | undefined,
  timezone: string
): Promise<void> {
  const usersWith3Warns = await getUsersWith3Warns(groupId);

  if (usersWith3Warns.length === 0) {
    console.log(`[WarnService] ✅ No users with 3+ warns in group ${groupId}`);
    return;
  }

  const message = formatWarnReportMessage(usersWith3Warns);

  try {
    const options: any = {
      parse_mode: 'HTML',
    };

    // Если указан topic_id, добавляем его
    if (reportTopicId && reportTopicId !== 1) {
      options.message_thread_id = reportTopicId;
    }

    await bot.telegram.sendMessage(reportGroupId, message, options);
    console.log(`[WarnService] ✅ Sent warn report for group ${groupId} to report group ${reportGroupId}`);
  } catch (error: any) {
    console.error(`[WarnService] ❌ Error sending warn report for group ${groupId}:`, error);
  }
}

/**
 * Получает группы, для которых нужно проверять варны
 * (группы с включенными варнами и настроенной группой для отчетов)
 */
export async function getGroupsWithWarnsEnabled(): Promise<Array<{ groupId: number; reportGroupId: number; reportTopicId?: number }>> {
  const query = `
    SELECT 
      group_id,
      warn_report_group_id AS report_group_id,
      warn_report_topic_id AS report_topic_id
    FROM group_warn_settings
    WHERE warns_enabled = TRUE
      AND warn_report_group_id IS NOT NULL
  `;

  const results = await selectQuery(query);
  return results.map((row: any) => ({
    groupId: row.groupId || row.group_id,
    reportGroupId: row.reportGroupId || row.report_group_id,
    reportTopicId: row.reportTopicId || row.report_topic_id,
  }));
}

