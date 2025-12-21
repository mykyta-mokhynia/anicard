import { Context } from 'telegraf';
import { executeQuery, selectQuery } from '../db';

/**
 * Сохраняет или обновляет ответ пользователя на опросник
 * Если optionIds пустой массив - удаляет запись (пользователь убрал голос)
 */
export async function savePollAnswer(
  pollId: string,
  userId: number,
  optionIds: number[],
  pollDate: Date
): Promise<void> {
  // Сначала находим ID опросника в нашей базе
  const pollQuery = `
    SELECT id, poll_date FROM polls 
    WHERE poll_id = ?
    LIMIT 1
  `;
  const poll = await selectQuery(pollQuery, [pollId], false);

  if (!poll) {
    console.warn(`[PollAnswersService] Poll ${pollId} not found in database`);
    return;
  }

  const dbPollId = poll.id;
  
  // Используем дату из БД (poll.poll_date), так как она уже сохранена с учетом часового пояса группы
  // poll_date может быть строкой формата YYYY-MM-DD или Date объектом
  let dateStr: string;
  if (poll.pollDate instanceof Date) {
    dateStr = poll.pollDate.toISOString().split('T')[0];
  } else if (typeof poll.pollDate === 'string') {
    dateStr = poll.pollDate.split('T')[0]; // На случай, если есть время
  } else {
    // Fallback: используем дату из параметра
    dateStr = pollDate.toISOString().split('T')[0];
  }

  // Если optionIds пустой массив - пользователь убрал голос, удаляем запись
  if (optionIds.length === 0) {
    const deleteQuery = `
      DELETE FROM poll_answers 
      WHERE poll_id = ? AND user_id = ?
    `;
    
    await executeQuery(deleteQuery, [dbPollId, userId]);
    console.log(`[PollAnswersService] ✅ Deleted answer for user ${userId} on poll ${pollId} (user removed vote)`);
    return;
  }

  // Сохраняем или обновляем ответ
  const upsertQuery = `
    INSERT INTO poll_answers (poll_id, user_id, option_ids, poll_date)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      option_ids = VALUES(option_ids),
      updated_at = CURRENT_TIMESTAMP
  `;

  await executeQuery(upsertQuery, [
    dbPollId,
    userId,
    JSON.stringify(optionIds),
    dateStr,
  ]);

  console.log(`[PollAnswersService] ✅ Saved/updated answer for user ${userId} on poll ${pollId}: options ${optionIds.join(', ')}`);
}

/**
 * Сохраняет информацию об опроснике в базу данных
 */
export async function savePollInfo(
  groupId: number,
  topicId: number | undefined,
  pollId: string,
  pollType: 'clan_battles' | 'demon_battles',
  question: string,
  pollDate: Date,
  pinnedMessageId?: number | null
): Promise<void> {
  // Получаем часовой пояс группы для правильного определения даты
  const { selectQuery, executeQuery } = await import('../db');
  
  // Получаем настройки группы для определения часового пояса
  const settingsQuery = `SELECT timezone FROM group_settings WHERE group_id = ? LIMIT 1`;
  const settings = await selectQuery(settingsQuery, [groupId], false);
  const timezone = settings?.timezone || 'Europe/Kiev';

  // Получаем дату в формате YYYY-MM-DD с учетом часового пояса группы
  const { getDateStringInTimezone } = await import('../utils/dateHelpers');
  const dateStr = getDateStringInTimezone(timezone);

  // Если topicId не указан, используем 1 для общего чата
  const finalTopicId = topicId !== undefined ? topicId : 1;

  // Если pinnedMessageId указан, обновляем его для всех polls за сегодня с таким же group_id и topic_id
  if (pinnedMessageId) {
    const updatePinnedQuery = `
      UPDATE polls
      SET pinned_message_id = ?
      WHERE group_id = ?
        AND topic_id = ?
        AND poll_date = ?
    `;
    await executeQuery(updatePinnedQuery, [pinnedMessageId, groupId, finalTopicId, dateStr]);
  }

  const query = `
    INSERT INTO polls (group_id, topic_id, poll_id, poll_type, question, poll_date, pinned_message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      pinned_message_id = COALESCE(?, pinned_message_id),
      updated_at = CURRENT_TIMESTAMP
  `;

  await executeQuery(query, [
    groupId,
    finalTopicId,
    pollId,
    pollType,
    question,
    dateStr, // Используем дату с учетом часового пояса группы
    pinnedMessageId || null,
    pinnedMessageId || null, // Для ON DUPLICATE KEY UPDATE
  ]);

  console.log(`[PollAnswersService] ✅ Saved poll info: ${pollType} (ID: ${pollId}) for group ${groupId}, date: ${dateStr} (timezone: ${timezone})`);
}

/**
 * Получает ответы пользователя на опросники за определенную дату для конкретной группы
 * ВАЖНО: Всегда фильтрует по group_id для изоляции данных между группами
 */
export async function getUserPollAnswers(
  userId: number,
  groupId: number,
  pollDate: Date
): Promise<Array<{ pollId: string; optionIds: number[] }>> {
  const dateStr = pollDate.toISOString().split('T')[0];

  const query = `
    SELECT 
      p.poll_id,
      pa.option_ids
    FROM poll_answers pa
    INNER JOIN polls p ON p.id = pa.poll_id
    WHERE pa.user_id = ? 
      AND p.group_id = ?
      AND pa.poll_date = ?
  `;

  const results = await selectQuery(query, [userId, groupId, dateStr]);

  return results.map((row: any) => ({
    pollId: row.pollId,
    optionIds: JSON.parse(row.optionIds || '[]'),
  }));
}

/**
 * Очищает данные старше 60 дней (можно вызывать вручную)
 */
export async function cleanupOldPollData(): Promise<void> {
  // Удаляем опросники старше 60 дней
  const pollsQuery = `
    DELETE FROM polls 
    WHERE poll_date < DATE_SUB(CURRENT_DATE, INTERVAL 60 DAY)
  `;
  await executeQuery(pollsQuery);

  // Удаляем ответы старше 60 дней (на случай если опросник уже удален)
  const answersQuery = `
    DELETE FROM poll_answers 
    WHERE poll_date < DATE_SUB(CURRENT_DATE, INTERVAL 60 DAY)
  `;
  await executeQuery(answersQuery);

  console.log(`[PollAnswersService] ✅ Cleaned up old poll data (older than 60 days)`);
}

