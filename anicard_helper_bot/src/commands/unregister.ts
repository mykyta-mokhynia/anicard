import { Context } from 'telegraf';
import { removeGroupMember } from '../services/groupMembersService';

/**
 * Команда /unregister - отмена регистрации пользователя в системе
 */
export async function unregisterCommand(ctx: Context) {
  // Проверяем, что команда вызвана в группе
  if (!ctx.chat || !('id' in ctx.chat)) {
    return;
  }

  if (!ctx.from) {
    return;
  }

  const groupId = ctx.chat.id;
  const userId = ctx.from.id;

  try {
    // Проверяем, зарегистрирован ли пользователь
    const { selectQuery } = await import('../db');
    const existingMember = await selectQuery(
      `SELECT status FROM group_members WHERE group_id = ? AND user_id = ?`,
      [groupId, userId],
      false
    );

    if (!existingMember || existingMember.status !== 'member') {
      // Пользователь не зарегистрирован
      const message = 
        'ℹ️ **Вы не зарегистрированы**\n\n' +
        'Вы не зарегистрированы в системе бота для этой группы.';

      await ctx.reply(message, { parse_mode: 'Markdown' });
      return;
    }

    // Отменяем регистрацию (помечаем как left)
    await removeGroupMember(groupId, userId);

    const message = 
      '✅ **Регистрация отменена**\n\n' +
      'Вы успешно отменили регистрацию в системе бота.\n\n' +
      'Для повторной регистрации используйте команду /register';

    await ctx.reply(message, { parse_mode: 'Markdown' });
    console.log(`[Unregister] ✅ User ${userId} unregistered from group ${groupId}`);
  } catch (error: any) {
    console.error('[Unregister] Error:', error);
    await ctx.reply('❌ Произошла ошибка при отмене регистрации.');
  }
}

