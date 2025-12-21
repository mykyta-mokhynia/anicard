import { Context } from 'telegraf';
import { selectQuery } from '../db';
import { GroupTopic } from '../models/tables/group_topics';

/**
 * Получает список тем из базы данных для группы
 * ВАЖНО: Всегда включает тему с ID = 1 (общий чат), даже если её нет в БД
 */
export async function getGroupTopicsFromDB(groupId: number, page: number = 0, limit: number = 10): Promise<{
  topics: GroupTopic[];
  total: number;
  hasMore: boolean;
}> {
  // Сначала убеждаемся, что тема с ID = 1 (общий чат) существует в БД
  await ensureGeneralTopicExists(groupId);

  // Получаем все темы (без пагинации), чтобы правильно обработать тему с ID = 1
  const allTopicsQuery = `
    SELECT * FROM group_topics 
    WHERE group_id = ?
    ORDER BY topic_id ASC
  `;
  const allTopics = await selectQuery(allTopicsQuery, [groupId]);

  // Убеждаемся, что тема с ID = 1 есть в списке
  const hasGeneralTopic = allTopics.some((t: any) => (t.topicId || t.topic_id) === 1);
  if (!hasGeneralTopic) {
    const generalTopic: GroupTopic = {
      groupId,
      topicId: 1,
      topicName: 'Общий чат',
    };
    allTopics.unshift(generalTopic);
  } else {
    // Если тема с ID = 1 уже есть, перемещаем её в начало списка
    const generalTopicIndex = allTopics.findIndex((t: any) => (t.topicId || t.topic_id) === 1);
    if (generalTopicIndex > 0) {
      const [generalTopic] = allTopics.splice(generalTopicIndex, 1);
      allTopics.unshift(generalTopic);
    }
    // Обновляем название темы с ID = 1 на "Общий чат"
    const generalTopic = allTopics[0];
    if ((generalTopic.topicId || (generalTopic as any).topic_id) === 1) {
      (generalTopic as any).topicName = 'Общий чат';
      (generalTopic as any).topic_name = 'Общий чат';
    }
  }

  // Применяем пагинацию
  const offset = page * limit;
  const total = allTopics.length;
  const paginatedTopics = allTopics.slice(offset, offset + limit);

  return {
    topics: paginatedTopics || [],
    total,
    hasMore: offset + paginatedTopics.length < total,
  };
}

/**
 * Убеждается, что тема с ID = 1 (общий чат) существует в базе данных
 */
async function ensureGeneralTopicExists(groupId: number): Promise<void> {
  try {
    const checkQuery = `
      SELECT * FROM group_topics 
      WHERE group_id = ? AND topic_id = 1
    `;
    const existing = await selectQuery(checkQuery, [groupId], false);
    
    if (!existing) {
      // Создаем тему "Общий чат" с ID = 1
      const { getGroupTopicUpsertQuery } = await import('../crud/group_topics_crud');
      const { executeQuery } = await import('../db');
      
      const generalTopic: GroupTopic = {
        groupId,
        topicId: 1,
        topicName: 'Общий чат',
      };
      
      const queryInfo = getGroupTopicUpsertQuery(generalTopic);
      await executeQuery(queryInfo.query);
      console.log(`[TopicsService] ✅ Created general topic (ID: 1) for group ${groupId}`);
    }
  } catch (error: any) {
    console.error(`[TopicsService] Error ensuring general topic exists:`, error.message);
    // Не прерываем выполнение, если не удалось создать
  }
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
 * ВАЖНО: Всегда создает тему с ID = 1 (общий чат), если её нет
 */
export async function syncTopicsFromTelegram(ctx: Context, groupId: number): Promise<GroupTopic[]> {
  console.log(`[TopicsService] Starting sync for group ${groupId}`);
  
  // Сначала убеждаемся, что тема с ID = 1 (общий чат) существует
  await ensureGeneralTopicExists(groupId);
  
  const telegramTopics = await getGroupTopicsFromTelegram(ctx);
  
  // Сохраняем темы в базу данных
  const { getGroupTopicUpsertQuery } = await import('../crud/group_topics_crud');
  const { executeQuery } = await import('../db');

  if (telegramTopics.length > 0) {
    console.log(`[TopicsService] Found ${telegramTopics.length} topics, saving to database...`);

    for (const topic of telegramTopics) {
      // Пропускаем тему с ID = 1, так как она уже создана выше
      if (topic.topicId === 1) {
        continue;
      }
      
      try {
        const queryInfo = getGroupTopicUpsertQuery(topic);
        await executeQuery(queryInfo.query);
        console.log(`[TopicsService] Saved topic: ${topic.topicName} (ID: ${topic.topicId})`);
      } catch (error: any) {
        console.error(`[TopicsService] Error saving topic ${topic.topicId}:`, error.message);
      }
    }

    console.log(`[TopicsService] Sync completed, saved ${telegramTopics.length} topics`);
  } else {
    console.log('[TopicsService] No topics found in Telegram (only general topic exists)');
  }

  // Возвращаем список тем, включая общий чат
  const allTopics = await getGroupTopicsFromDB(groupId, 0, 100);
  return allTopics.topics;
}

