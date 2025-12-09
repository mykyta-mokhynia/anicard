import { Context } from 'telegraf';
import { selectQuery } from '../db';
import { savePollInfo } from './pollAnswersService';

/**
 * Создает опросник "Клановые Сражения"
 */
export async function createClanBattlesPoll(ctx: Context, chatId: number, messageThreadId?: number) {
  const question = 'Клановые Сражения';
  const options = [
    '6 Вин Вин',
    '4 Вин Ничья',
    '3 Вин Луз',
    '2 Ничья Ничья',
    '1 Ничья Луз',
    '0 Луз Луз',
  ];

  try {
    // Проверяем, не создан ли уже опросник за сегодня для этой группы
    // ВАЖНО: Опросник один на группу в день, независимо от темы (topic_id)
    // Используем CURDATE() для получения даты в часовом поясе сервера БД
    const { selectQuery } = await import('../db');
    const existingPoll = await selectQuery(
      `SELECT id FROM polls WHERE group_id = ? AND poll_type = ? AND poll_date = CURDATE() LIMIT 1`,
      [chatId, 'clan_battles'],
      false
    );

    if (existingPoll) {
      throw new Error('Опросник на сегодня уже создан. Невозможно создать еще один.');
    }

    const pollOptions: any = {
      is_anonymous: false,
    };

    // Если topicId указан и не равен 1, передаем message_thread_id
    if (messageThreadId && messageThreadId !== 1) {
      pollOptions.message_thread_id = messageThreadId;
    }

    const sentMessage = await ctx.telegram.sendPoll(chatId, question, options, pollOptions);
    
    // Сохраняем информацию об опроснике в базу данных
    // Используем topicId из messageThreadId или 1 для общего чата
    if (sentMessage.poll) {
      const pollDate = new Date();
      const finalTopicId = messageThreadId || 1;
      await savePollInfo(
        chatId,
        finalTopicId,
        sentMessage.poll.id,
        'clan_battles',
        question,
        pollDate
      );
    }
    
    console.log(`[PollsService] ✅ Created "Клановые Сражения" poll in chat ${chatId}${messageThreadId ? `, topic ${messageThreadId}` : ''}`);
  } catch (error: any) {
    console.error('[PollsService] ❌ Error creating "Клановые Сражения" poll:', error);
    throw error;
  }
}

/**
 * Создает опросник "Демонические Сражения"
 */
export async function createDemonBattlesPoll(ctx: Context, chatId: number, messageThreadId?: number) {
  const question = 'Демонические Сражения';
  const options = [
    '10 Вин Вин',
    '7 Вин Ничья',
    '5 Вин Луз',
    '4 Ничья Ничья',
    '2 Ничья Луз',
    '0 Луз Луз',
  ];

  try {
    // Проверяем, не создан ли уже опросник за сегодня для этой группы
    // ВАЖНО: Опросник один на группу в день, независимо от темы (topic_id)
    // Используем CURDATE() для получения даты в часовом поясе сервера БД
    const { selectQuery } = await import('../db');
    const existingPoll = await selectQuery(
      `SELECT id FROM polls WHERE group_id = ? AND poll_type = ? AND poll_date = CURDATE() LIMIT 1`,
      [chatId, 'demon_battles'],
      false
    );

    if (existingPoll) {
      throw new Error('Опросник на сегодня уже создан. Невозможно создать еще один.');
    }

    const pollOptions: any = {
      is_anonymous: false,
    };

    // Если topicId указан и не равен 1, передаем message_thread_id
    if (messageThreadId && messageThreadId !== 1) {
      pollOptions.message_thread_id = messageThreadId;
    }

    const sentMessage = await ctx.telegram.sendPoll(chatId, question, options, pollOptions);
    
    // Сохраняем информацию об опроснике в базу данных
    // Используем topicId из messageThreadId или 1 для общего чата
    if (sentMessage.poll) {
      const pollDate = new Date();
      const finalTopicId = messageThreadId || 1;
      await savePollInfo(
        chatId,
        finalTopicId,
        sentMessage.poll.id,
        'demon_battles',
        question,
        pollDate
      );
    }
    
    console.log(`[PollsService] ✅ Created "Демонические Сражения" poll in chat ${chatId}${messageThreadId ? `, topic ${messageThreadId}` : ''}`);
  } catch (error: any) {
    console.error('[PollsService] ❌ Error creating "Демонические Сражения" poll:', error);
    throw error;
  }
}

/**
 * Создает оба опросника для группы
 */
export async function createDailyPolls(ctx: Context, groupId: number, topicId?: number) {
  try {
    // Если topicId не указан, используем 1 для общего чата
    const finalTopicId = topicId || 1;
    
    // Создаем опросник "Клановые Сражения"
    await createClanBattlesPoll(ctx, groupId, finalTopicId);
    
    // Небольшая задержка между опросниками
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Создаем опросник "Демонические Сражения"
    await createDemonBattlesPoll(ctx, groupId, finalTopicId);
    
    console.log(`[PollsService] ✅ Created daily polls for group ${groupId}, topic ${finalTopicId}`);
  } catch (error: any) {
    console.error('[PollsService] ❌ Error creating daily polls:', error);
    throw error;
  }
}

/**
 * Получает список групп и тем, для которых включены опросники
 */
export async function getGroupsWithPollsEnabled(): Promise<Array<{ groupId: number; topicId?: number; topicName?: string }>> {
  // Получаем темы с включенными опросниками
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

  const groups: Array<{ groupId: number; topicId?: number; topicName?: string }> = [];
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

