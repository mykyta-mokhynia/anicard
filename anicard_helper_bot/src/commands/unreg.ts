import { Context } from 'telegraf';
import { executeQuery, selectQuery } from '../db';

/**
 * Команда /unreg - переводит пользователя в статус 'off'
 * Пользователь не будет отображаться в /group, но будет получать напоминания
 */
export async function unregCommand(ctx: Context) {
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

  if (!ctx.from) {
    return;
  }

  const groupId = ctx.chat.id;
  const userId = ctx.from.id;

  try {
    // Проверяем, зарегистрирован ли пользователь
    const existingMember = await selectQuery(
      `SELECT user_id, status FROM group_members WHERE group_id = ? AND user_id = ?`,
      [groupId, userId],
      false
    );

    if (!existingMember) {
      // Пользователь не зарегистрирован
      const message = 
        'ℹ️ <b>Вы не зарегистрированы</b>\n\n' +
        'Вы не зарегистрированы в системе бота для этой группы.\n\n' +
        'Используйте команду /register для регистрации.';

      await ctx.reply(message, { parse_mode: 'HTML' });
      return;
    }

    if (existingMember.status === 'off') {
      // Пользователь уже в статусе 'off'
      const message = 
        'ℹ️ <b>Вы уже в статусе "неактивен"</b>\n\n' +
        'Вы не будете отображаться в команде /group, но будете получать напоминания о неотыгранных боях.';

      await ctx.reply(message, { parse_mode: 'HTML' });
      return;
    }

    // Переводим пользователя в статус 'off'
    const query = `
      UPDATE group_members
      SET status = 'off', updated_at = CURRENT_TIMESTAMP
      WHERE group_id = ? AND user_id = ?
    `;

    await executeQuery(query, [groupId, userId]);

    // Получаем имя пользователя
    let displayName = '';
    if (ctx.from.first_name) {
      displayName = ctx.from.first_name;
      if (ctx.from.last_name) {
        displayName += ' ' + ctx.from.last_name;
      }
    } else if (ctx.from.username) {
      displayName = ctx.from.username;
    } else {
      displayName = `Пользователь ${userId}`;
    }

    // Экранируем HTML
    const escapedName = displayName
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const message = 
      `${escapedName}, на период неактивности Вы исключены из призыва на клановые и демонические битвы, но вы все также будете получать уведомления о неотыгранных битвах.`;

    // Отправляем как reply на сообщение пользователя
    const replyOptions: any = {
      parse_mode: 'HTML' as const,
    };
    
    if (ctx.message && 'message_id' in ctx.message) {
      replyOptions.reply_parameters = {
        message_id: ctx.message.message_id,
      };
    }
    
    await ctx.reply(message, replyOptions);
    console.log(`[Unreg] ✅ User ${userId} set to 'off' status in group ${groupId}`);
  } catch (error: any) {
    console.error('[Unreg] Error:', error);
    await ctx.reply('❌ Произошла ошибка при изменении статуса.');
  }
}

