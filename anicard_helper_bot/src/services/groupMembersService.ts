import { Context } from 'telegraf';
import { executeQuery, selectQuery } from '../db';

/**
 * Добавляет или обновляет участника группы
 */
export async function upsertGroupMember(
  groupId: number,
  userId: number,
  firstName?: string,
  lastName?: string,
  username?: string,
  status: 'member' | 'left' | 'kicked' | 'off' = 'member'
): Promise<void> {
  const query = `
    INSERT INTO group_members 
    (group_id, user_id, first_name, last_name, username, status)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      first_name = VALUES(first_name),
      last_name = VALUES(last_name),
      username = VALUES(username),
      status = VALUES(status),
      updated_at = CURRENT_TIMESTAMP
  `;

  await executeQuery(query, [
    groupId,
    userId,
    firstName || null,
    lastName || null,
    username || null,
    status,
  ]);

  console.log(`[GroupMembers] ✅ Upserted member ${userId} in group ${groupId} (status: ${status})`);
}

/**
 * Помечает участника как вышедшего из группы (устанавливает статус 'left')
 * При возврате пользователя статус можно будет обновить обратно на 'member'
 */
export async function removeGroupMember(
  groupId: number,
  userId: number
): Promise<void> {
  const query = `
    UPDATE group_members
    SET status = 'left', updated_at = CURRENT_TIMESTAMP
    WHERE group_id = ? AND user_id = ?
  `;

  await executeQuery(query, [groupId, userId]);
  console.log(`[GroupMembers] ✅ Set member ${userId} status to 'left' in group ${groupId}`);
}

/**
 * Получает список активных участников группы
 * Включает всех пользователей, кроме тех кто вышел или был исключен (status != 'left' AND status != 'kicked')
 * То есть включает: 'member', 'off'
 */
export async function getActiveGroupMembers(
  groupId: number
): Promise<Array<{ userId: number; firstName?: string; lastName?: string; username?: string }>> {
  const query = `
    SELECT user_id, first_name, last_name, username
    FROM group_members
    WHERE group_id = ? AND status != 'left' AND status != 'kicked'
    ORDER BY first_name, username, user_id
  `;

  const results = await selectQuery(query, [groupId]);

  return results.map((row: any) => ({
    userId: row.userId,
    firstName: row.firstName || undefined,
    lastName: row.lastName || undefined,
    username: row.username || undefined,
  }));
}

/**
 * Получает информацию о участнике группы
 */
export async function getGroupMember(
  groupId: number,
  userId: number
): Promise<{ userId: number; firstName?: string; lastName?: string; username?: string; status: string } | null> {
  const query = `
    SELECT user_id, first_name, last_name, username, status
    FROM group_members
    WHERE group_id = ? AND user_id = ?
    LIMIT 1
  `;

  const result = await selectQuery(query, [groupId, userId], false);

  if (!result) {
    return null;
  }

  return {
    userId: result.userId,
    firstName: result.firstName || undefined,
    lastName: result.lastName || undefined,
    username: result.username || undefined,
    status: result.status,
  };
}

