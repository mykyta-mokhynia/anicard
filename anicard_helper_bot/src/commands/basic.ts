import { Context } from 'telegraf';
import { upsertUser } from '../services/userService';
import { AccessLevel } from '../types/user';
import { showReplyKeyboard } from '../services/privateMenuService';

/**
 * Команда /start - приветствие и регистрация пользователя в системе
 * Создает или обновляет запись в таблице users и показывает reply keyboard
 */
export async function startCommand(ctx: Context) {
  // Проверяем, что команда вызвана в личных сообщениях
  if (!ctx.chat || ctx.chat.type !== 'private') {
    await ctx.reply('❌ Эта команда доступна только в личных сообщениях.');
    return;
  }

  if (!ctx.from) {
    await ctx.reply('❌ Не удалось получить информацию о пользователе.');
    return;
  }

  const telegramId = ctx.from.id;
  const firstName = ctx.from.first_name;
  const lastName = ctx.from.last_name;
  const username = ctx.from.username;

  try {
    // Создаем или обновляем пользователя в БД
    // По умолчанию access_level = 1 (MEMBER)
    await upsertUser(
      telegramId,
      firstName,
      lastName,
      username,
      AccessLevel.MEMBER
    );

    // Показываем reply keyboard с кнопками
    await showReplyKeyboard(ctx);
  } catch (error: any) {
    console.error(`[Start] ❌ Error registering user ${telegramId}:`, error);
    await ctx.reply(
      '👋 Привет! Я бот для управления группами AniCard Gods.\n\n' +
      '⚠️ Произошла ошибка при регистрации. Попробуйте позже.'
    );
  }
}
