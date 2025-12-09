import { Context } from 'telegraf';
import { createCollectionMessages } from '../services/groupCollectionService';
import { getGroupSettingsComplete } from '../types/crud/group_settings_complete_crud';

/**
 * Команда /group - запускает разовый сбор групп для текущей группы/темы
 * (только для админов, игнорирует проверки времени)
 */
export async function groupCommand(ctx: Context) {
  // Проверяем, что команда вызвана в группе
  if (!ctx.chat || !('id' in ctx.chat)) {
    return;
  }

  // Проверяем права администратора пользователя
  if (!ctx.from) {
    return;
  }

  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
    
    if (member.status !== 'administrator' && member.status !== 'creator') {
      await ctx.reply('❌ Эта команда доступна только администраторам.');
      return;
    }
  } catch (error: any) {
    console.error('[Group] Error checking admin:', error);
    await ctx.reply('❌ Ошибка при проверке прав администратора.');
    return;
  }

  const groupId = ctx.chat.id;
  const messageThreadId = 'message_thread_id' in ctx.message! 
    ? ctx.message!.message_thread_id 
    : undefined;

  // Если команда вызвана в теме, используем ID темы, иначе используем 1 (общий чат)
  const topicId = messageThreadId || 1;

  try {
    // Проверяем, включен ли сбор групп для этой группы/темы
    const settings = await getGroupSettingsComplete(groupId);
    
    if (!settings?.groupSettings) {
      await ctx.reply('ℹ️ Настройки группы не найдены. Используйте /settings для настройки.');
      return;
    }

    // Проверяем, включен ли сбор групп для этой темы
    const { getTopicComplete, saveTopicComplete } = await import('../types/crud/topic_complete_crud');
    let topic = await getTopicComplete(groupId, topicId);
    
    // Если темы нет, создаем её (для общего чата с topicId = 1)
    if (!topic && !messageThreadId && topicId === 1) {
      // Создаем тему для общего чата
      topic = {
        groupTopic: {
          groupId,
          topicId: 1,
          topicName: 'Общий чат',
        },
        topicFeature: {
          groupId,
          topicId: 1,
          featurePolls: false,
          featureTop: false,
          featureGroupCollection: false,
        },
      };
      await saveTopicComplete(topic);
      console.log(`[Group] ✅ Created default topic for group ${groupId}`);
    }
    
    if (!topic || !topic.topicFeature?.featureGroupCollection) {
      if (messageThreadId) {
        await ctx.reply('ℹ️ Сбор групп не включен для этой темы. Используйте /settings для настройки.');
      } else {
        await ctx.reply('ℹ️ Сбор групп не включен. Используйте /settings для настройки.');
      }
      return;
    }

    // Отправляем сообщения о сборе
    await createCollectionMessages(ctx, groupId, topicId);
    
    console.log(`[Group] ✅ Created collection messages for group ${groupId}, topic ${topicId}`);
  } catch (error: any) {
    console.error('[Group] Error:', error);
    await ctx.reply('❌ Произошла ошибка при запуске интервалов.');
  }
}

