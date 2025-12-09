import { Context } from 'telegraf';
import { selectQuery } from '../db';
import { GroupTopic } from '../models/tables/group_topics';

/**
 * Получает список тем из базы данных для группы
 */
export async function getGroupTopicsFromDB(groupId: number, page: number = 0, limit: number = 10): Promise<{
  topics: GroupTopic[];
  total: number;
  hasMore: boolean;
}> {
  const offset = page * limit;

  // Получаем темы с пагинацией
  const topicsQuery = `
    SELECT * FROM group_topics 
    WHERE group_id = ?
    ORDER BY topic_id ASC
    LIMIT ? OFFSET ?
  `;

  const topics = await selectQuery(topicsQuery, [groupId, limit, offset]);

  // Получаем общее количество тем
  const countQuery = `
    SELECT COUNT(*) as total FROM group_topics 
    WHERE group_id = ?
  `;
  const countResult = await selectQuery(countQuery, [groupId], false);
  const total = countResult?.total || 0;

  return {
    topics: topics || [],
    total,
    hasMore: offset + topics.length < total,
  };
}

/**
 * Пытается получить темы из Telegram API
 * Использует прямой вызов API, так как метод может отсутствовать в типах
 */
export async function getGroupTopicsFromTelegram(ctx: Context): Promise<GroupTopic[]> {
  if (!ctx.chat || !('id' in ctx.chat)) {
    return [];
  }

  const chatId = ctx.chat.id;

  try {
    // Пробуем использовать прямой вызов API метода getForumTopics
    // Этот метод доступен в Telegram Bot API 6.0+
    // @ts-ignore - метод может отсутствовать в типах Telegraf
    const result = await ctx.telegram.callApi('getForumTopics' as any, {
      chat_id: chatId,
      limit: 100, // Максимум тем за раз
    }) as any;

    if (result && result.topics && Array.isArray(result.topics)) {
      const topics: GroupTopic[] = result.topics.map((topic: any) => ({
        groupId: chatId,
        topicId: topic.message_thread_id,
        topicName: topic.name || `Тема ${topic.message_thread_id}`,
      }));

      console.log(`[TopicsService] Found ${topics.length} topics via getForumTopics`);
      return topics;
    }

    // Если результат есть, но структура другая
    if (result && result.topics) {
      console.log('[TopicsService] Unexpected result structure:', result);
    }
  } catch (error: any) {
    // Метод getForumTopics недоступен в Telegram Bot API
    // Telegram не предоставляет прямой способ получить список всех тем форума
    // Темы можно получить только через события при их создании/редактировании
    console.warn('[TopicsService] getForumTopics not available in API:', error.message);
    console.warn('[TopicsService] Note: Telegram Bot API does not provide a method to list all forum topics.');
    console.warn('[TopicsService] Topics will be saved automatically when created/edited via forum_topic_created/edited events.');
    
    // Проверяем, что это действительно форум
    try {
      const chatInfo = await ctx.telegram.getChat(chatId);
      const isForum = 'is_forum' in chatInfo ? chatInfo.is_forum : false;
      console.log('[TopicsService] Chat info:', {
        id: chatInfo.id,
        type: chatInfo.type,
        isForum,
      });
      
      if (!isForum) {
        console.warn('[TopicsService] Chat is not a forum. Topics feature requires a forum-enabled supergroup.');
      }
    } catch (chatError: any) {
      console.warn('[TopicsService] getChat failed:', chatError.message);
    }
  }

  return [];
}

/**
 * Синхронизирует темы из Telegram с базой данных
 */
export async function syncTopicsFromTelegram(ctx: Context, groupId: number): Promise<GroupTopic[]> {
  console.log(`[TopicsService] Starting sync for group ${groupId}`);
  
  const telegramTopics = await getGroupTopicsFromTelegram(ctx);
  
  if (telegramTopics.length === 0) {
    console.log('[TopicsService] No topics found in Telegram, returning empty array');
    return [];
  }

  console.log(`[TopicsService] Found ${telegramTopics.length} topics, saving to database...`);

  // Сохраняем темы в базу данных
  const { getGroupTopicUpsertQuery } = await import('../crud/group_topics_crud');
  const { executeQuery } = await import('../db');

  for (const topic of telegramTopics) {
    try {
      const queryInfo = getGroupTopicUpsertQuery(topic);
      await executeQuery(queryInfo.query);
      console.log(`[TopicsService] Saved topic: ${topic.topicName} (ID: ${topic.topicId})`);
    } catch (error: any) {
      console.error(`[TopicsService] Error saving topic ${topic.topicId}:`, error.message);
    }
  }

  console.log(`[TopicsService] Sync completed, saved ${telegramTopics.length} topics`);
  return telegramTopics;
}

