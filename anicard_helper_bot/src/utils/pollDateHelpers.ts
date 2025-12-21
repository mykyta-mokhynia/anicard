import { selectQuery } from '../db';
import { getDateStringInTimezone } from './dateHelpers';

/**
 * Получает дату в формате YYYY-MM-DD для группы с учетом её часового пояса
 */
export async function getGroupDateString(groupId: number): Promise<string> {
  // Получаем часовой пояс группы
  const settingsQuery = `SELECT timezone FROM group_settings WHERE group_id = ? LIMIT 1`;
  const settings = await selectQuery(settingsQuery, [groupId], false);
  const timezone = settings?.timezone || 'Europe/Kiev';
  
  // Получаем дату с учетом часового пояса
  return getDateStringInTimezone(timezone);
}

/**
 * Получает часовой пояс группы
 */
export async function getGroupTimezone(groupId: number): Promise<string> {
  const settingsQuery = `SELECT timezone FROM group_settings WHERE group_id = ? LIMIT 1`;
  const settings = await selectQuery(settingsQuery, [groupId], false);
  return settings?.timezone || 'Europe/Kiev';
}

