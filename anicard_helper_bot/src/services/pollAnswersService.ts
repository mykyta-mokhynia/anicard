import { Context } from 'telegraf';
import { executeQuery, selectQuery } from '../db';

/**
 * Сохраняет или обновляет ответ пользователя на опросник
 */
export async function savePollAnswer(
  pollId: string,
  userId: number,
  optionIds: number[],
  pollDate: Date
): Promise<void> {
  // Сначала находим ID опросника в нашей базе
  const pollQuery = `
    SELECT id FROM polls 
    WHERE poll_id = ?
    LIMIT 1
  `;
  const poll = await selectQuery(pollQuery, [pollId], false);

  if (!poll) {
    console.warn(`[PollAnswersService] Poll ${pollId} not found in database`);
    return;
  }

  const dbPollId = poll.id;
  const dateStr = pollDate.toISOString().split('T')[0]; // YYYY-MM-DD

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

  console.log(`[PollAnswersService] ✅ Saved/updated answer for user ${userId} on poll ${pollId}`);
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
  pollDate: Date
): Promise<void> {
  // Используем SQL CURDATE() для получения даты в часовом поясе сервера БД
  // Это гарантирует, что дата будет одинаковой при сохранении и поиске
  const { executeQuery } = await import('../db');

  // Если topicId не указан, используем 1 для общего чата
  const finalTopicId = topicId !== undefined ? topicId : 1;

  const query = `
    INSERT INTO polls (group_id, topic_id, poll_id, poll_type, question, poll_date)
    VALUES (?, ?, ?, ?, ?, CURDATE())
    ON DUPLICATE KEY UPDATE
      updated_at = CURRENT_TIMESTAMP
  `;

  await executeQuery(query, [
    groupId,
    finalTopicId,
    pollId,
    pollType,
    question,
  ]);

  console.log(`[PollAnswersService] ✅ Saved poll info: ${pollType} (ID: ${pollId}) for group ${groupId}`);
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

