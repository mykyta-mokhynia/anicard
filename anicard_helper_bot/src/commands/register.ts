import { Context, Markup } from 'telegraf';
import { handleUserRegistration } from '../services/registrationService';

/**
 * Экранирует HTML символы для безопасного использования в HTML разметке
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Команда /register - регистрация пользователя в системе
 */
export async function registerCommand(ctx: Context) {
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
    // Проверяем, не зарегистрирован ли уже пользователь
    const { selectQuery } = await import('../db');
    const existingMember = await selectQuery(
      `SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'member'`,
      [groupId, userId],
      false
    );

    if (existingMember) {
      // Пользователь уже зарегистрирован
      const message = 
        'ℹ️ <b>Вы уже зарегистрированы!</b>\n\n' +
        'Вы уже зарегистрированы в системе бота для этой группы.';

      await ctx.reply(message, { parse_mode: 'HTML' });
      return;
    }

    // Формируем mention пользователя (используем HTML ссылку для избежания конфликтов)
    const userName = escapeHtml(ctx.from.first_name || ctx.from.username || 'пользователь');
    const mention = `<a href="tg://user?id=${ctx.from.id}">${userName}</a>`;

    // Показываем сообщение с подтверждением
    const message = 
      `⚔️ <b>Регистрация в системе AniCard Gods</b>\n\n` +
      `${mention}, для участия в клановых и демонических сражениях, а также для получения уведомлений о сборах, необходимо зарегистрироваться.\n\n` +
      `Нажмите на кнопку ниже для подтверждения регистрации:`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Подтвердить регистрацию', `registration:register:${groupId}:${userId}`),
      ],
    ]);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup,
    });
  } catch (error: any) {
    console.error('[Register] Error:', error);
    await ctx.reply('❌ Произошла ошибка при обработке команды регистрации.');
  }
}

