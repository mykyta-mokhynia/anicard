import { Context, Markup } from 'telegraf';
import { AccessLevel } from '../types/user';
import { getUserByTelegramId } from './userService';

/**
 * Генерирует reply keyboard для личных сообщений в зависимости от уровня доступа пользователя
 */
export async function generateReplyKeyboard(ctx: Context): Promise<any> {
  if (!ctx.from) {
    throw new Error('User information not available');
  }

  const telegramId = ctx.from.id;
  const user = await getUserByTelegramId(telegramId);

  if (!user) {
    throw new Error('User not found in database');
  }

  const accessLevel = user.accessLevel;
  const keyboard: any[] = [];

  // Базовые кнопки для всех пользователей (MEMBER и выше)
  keyboard.push([
    Markup.button.text('🔄 Трейды'),
    Markup.button.text('👥 Кланы')
  ]);

  // Кнопка "Информация" для пользователей с уровнем 2+
  if (accessLevel >= AccessLevel.TRADER) {
    keyboard.push([
      Markup.button.text('ℹ️ Информация'),
      Markup.button.text('📨 Запросы')
    ]);
  }

  if (accessLevel >= AccessLevel.MODERATOR) {
    // Модераторы и выше
    keyboard.push([
      Markup.button.text('🔐 Управление аккаунтами')
    ]);
  }

  if (accessLevel >= AccessLevel.DEPUTY) {
    // Зам и выше
    keyboard.push([
      Markup.button.text('👤 Управление пользователями')
    ]);
  }

  return Markup.keyboard(keyboard)
    .resize() // Кнопки подстраиваются под размер экрана
    .oneTime(false); // Клавиатура остается видимой
}

/**
 * Показывает reply keyboard в личных сообщениях
 */
export async function showReplyKeyboard(ctx: Context): Promise<void> {
  try {
    const keyboard = await generateReplyKeyboard(ctx);
    
    await ctx.reply(
      'Привет! 👋\n\n' +
      'Я бот, созданный для максимально комфортного времяпрепровождения в AniCard.\n\n' +
      'Ты можешь подключить автоматизированную систему для удобного создания отчетов по клановым и демоническим боям, ' +
      'или воспользоваться нашим трейд-листом, чтобы быстро найти нужные карты.\n\n' +
      'P.S: Данный бот не является официальным, а является личной разработкой одного из пользователей.',
      {
        reply_markup: keyboard.reply_markup,
      }
    );
  } catch (error: any) {
    console.error('[PrivateMenu] Error showing reply keyboard:', error);
    throw error;
  }
}

