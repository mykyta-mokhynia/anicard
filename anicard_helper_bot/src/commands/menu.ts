import { Context, Markup } from 'telegraf';
import { checkBotPermissions } from '../utils/permissions';

/**
 * Команда /menu - главное меню бота
 */
export async function menuCommand(ctx: Context) {
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

  const userId = ctx.from.id;
  const permissions = await checkBotPermissions(ctx);

  // Проверяем, достаточно ли прав
  if (!permissions.isAdmin) {
    await ctx.reply('❌ Бот должен быть администратором для доступа к меню.');
    return;
  }

  // Формируем сообщение
  let message = '📋 <b>Главное меню бота AniCard Gods</b>\n\n';
  message += 'Выберите действие:\n\n';

  // Создаем клавиатуру
  const keyboard: any[] = [];

  // Команды (добавляем user_id для проверки того, кто открыл меню)
  keyboard.push([
    Markup.button.callback('📊 Топ', `menu:command:top:${userId}`)
  ]);
  keyboard.push([
    Markup.button.callback('👥 Пользователи', `menu:command:users:${userId}`)
  ]);
  keyboard.push([
    Markup.button.callback('⚙️ Настройки', 'menu:command:settings')
  ]);

  // Часовой пояс (добавляем user_id)
  keyboard.push([
    Markup.button.callback('🌍 Часовой пояс', `menu:timezone:${userId}`)
  ]);

  // Кнопка "Закрыть" (добавляем user_id)
  keyboard.push([
    Markup.button.callback('❌ Закрыть', `menu:close:${userId}`)
  ]);

  try {
    // Проверяем, есть ли callback query (кнопка из меню)
    if (ctx.callbackQuery && ctx.callbackQuery.message && 'message_id' in ctx.callbackQuery.message) {
      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    } else {
      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    }
  } catch (error: any) {
    if (error.response?.error_code === 400 && 
        error.response?.description?.includes('message is not modified')) {
      return;
    }
    throw error;
  }
}

