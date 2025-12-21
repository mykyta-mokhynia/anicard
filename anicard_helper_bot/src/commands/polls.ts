import { Context } from 'telegraf';
import { createDailyPolls } from '../services/pollsService';

/**
 * Команда /polls - создает опросники (только для админов)
 */
export async function pollsCommand(ctx: Context) {
  // Проверяем, что команда вызвана в группе (не в личных сообщениях)
  if (!ctx.chat || ctx.chat.type === 'private') {
    await ctx.reply('❌ Эта команда доступна только в группах.');
    return;
  }

  // Проверяем, что это группа или супергруппа
  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
    await ctx.reply('❌ Эта команда доступна только в группах.');
    return;
  }

  // Проверяем права администратора пользователя
  if (!ctx.from) {
    return;
  }

  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
    
    if (member.status !== 'administrator' && member.status !== 'creator') {
      return;
    }
  } catch (error: any) {
    console.error('[Polls] Error checking admin:', error);
    return;
  }

  const groupId = ctx.chat.id;
  const messageThreadId = 'message_thread_id' in ctx.message! 
    ? ctx.message!.message_thread_id 
    : undefined;

  // Если команда вызвана не в теме, используем topicId = 1 для общего чата
  const topicId = messageThreadId || 1;

  try {
    await createDailyPolls(ctx, groupId, topicId);
  } catch (error: any) {
    console.error('[Polls] Error:', error);
    // Если опросник уже создан, показываем сообщение пользователю
    if (error.message && error.message.includes('уже создан')) {
      await ctx.reply('ℹ️ ' + error.message);
    }
  }
}

