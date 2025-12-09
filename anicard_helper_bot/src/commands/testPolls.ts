import { Context } from 'telegraf';
import { createDailyPolls } from '../services/pollsService';

/**
 * Команда /polls - создает опросники (только для админов)
 */
export async function pollsCommand(ctx: Context) {
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

  try {
    await createDailyPolls(ctx, groupId, messageThreadId);
  } catch (error: any) {
    console.error('[Polls] Error:', error);
  }
}

