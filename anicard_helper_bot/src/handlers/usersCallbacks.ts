import { Context } from 'telegraf';
import { showUsersList } from '../commands/users';

/**
 * Обрабатывает callback для навигации по списку пользователей
 */
export async function handleUsersCallback(ctx: Context) {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery) || !ctx.chat || !('id' in ctx.chat)) {
    return;
  }

  const data = ctx.callbackQuery.data;
  const parts = data.split(':');

  if (parts.length < 3 || parts[0] !== 'users' || parts[1] !== 'page') {
    return;
  }

  const page = parseInt(parts[2], 10);
  if (isNaN(page) || page < 0) {
    await ctx.answerCbQuery('❌ Неверная страница');
    return;
  }

  const groupId = ctx.chat.id;

  try {
    await showUsersList(ctx, groupId, page);
  } catch (error: any) {
    console.error('[UsersCallback] Error:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
}

