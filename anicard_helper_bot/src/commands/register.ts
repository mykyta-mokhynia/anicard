import { Context, Markup } from 'telegraf';
import { handleUserRegistration } from '../services/registrationService';

/**
 * Команда /register - регистрация пользователя в системе
 */
export async function registerCommand(ctx: Context) {
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
    // Проверяем, не зарегистрирован ли уже пользователь
    const { selectQuery } = await import('../db');
    const existingMember = await selectQuery(
      `SELECT status FROM group_members WHERE group_id = ? AND user_id = ?`,
      [groupId, userId],
      false
    );

    if (existingMember && existingMember.status === 'member') {
      // Пользователь уже зарегистрирован
      const message = 
        'ℹ️ **Вы уже зарегистрированы!**\n\n' +
        'Вы уже зарегистрированы в системе бота для этой группы.';

      await ctx.reply(message, { parse_mode: 'Markdown' });
      return;
    }

    // Формируем mention пользователя
    const mention = ctx.from.username 
      ? `@${ctx.from.username}` 
      : ctx.from.first_name 
      ? `[${ctx.from.first_name}](tg://user?id=${ctx.from.id})` 
      : `[пользователь](tg://user?id=${ctx.from.id})`;

    // Показываем сообщение с подтверждением
    const message = 
      `⚔️ **Регистрация в системе AniCard Gods**\n\n` +
      `${mention}, для участия в клановых и демонических сражениях, а также для получения уведомлений о сборах, необходимо зарегистрироваться.\n\n` +
      `Нажмите на кнопку ниже для подтверждения регистрации:`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Подтвердить регистрацию', `registration:register:${groupId}`),
      ],
    ]);

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup,
    });
  } catch (error: any) {
    console.error('[Register] Error:', error);
    await ctx.reply('❌ Произошла ошибка при обработке команды регистрации.');
  }
}

