import { Context } from 'telegraf';
import { createCollectionMessages } from '../services/groupCollectionService';

/**
 * Команда /group - ручной вызов сбора групп
 * Может быть вызван любым участником чата в любое время
 * Просто высчитывает, кто не отметился, и отправляет сообщение с упоминаниями
 */
export async function groupCommand(ctx: Context) {
  console.log('[Group] Command /group called');
  
  // Проверяем, что команда вызвана в группе (не в личных сообщениях)
  if (!ctx.chat || ctx.chat.type === 'private') {
    console.log('[Group] Command called in private chat');
    await ctx.reply('❌ Эта команда доступна только в группах.');
    return;
  }

  // Проверяем, что это группа или супергруппа
  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
    console.log('[Group] Command called in wrong chat type:', ctx.chat.type);
    await ctx.reply('❌ Эта команда доступна только в группах.');
    return;
  }

  const groupId = ctx.chat.id;
  console.log('[Group] Processing for group:', groupId);
  
  const messageThreadId = 'message_thread_id' in ctx.message! 
    ? ctx.message!.message_thread_id 
    : undefined;

  // Если команда вызвана в теме, используем ID темы, иначе используем 1 (общий чат)
  const topicId = messageThreadId || 1;
  console.log('[Group] Topic ID:', topicId);

  try {
    // Просто отправляем сообщения о сборе без проверок времени и настроек
    // Это ручной вызов, который работает в любое время
    console.log('[Group] Calling createCollectionMessages...');
    await createCollectionMessages(ctx, groupId, topicId);
    
    console.log(`[Group] ✅ Manual collection called by user ${ctx.from?.id} for group ${groupId}, topic ${topicId}`);
  } catch (error: any) {
    console.error('[Group] Error:', error);
    console.error('[Group] Error stack:', error.stack);
    await ctx.reply('❌ Произошла ошибка при отправке созыва.');
  }
}
