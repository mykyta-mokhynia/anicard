import { Context } from 'telegraf';
import { showSettingsMenu } from '../services/settingsService';

/**
 * Команда /settings - показывает меню настроек бота (только для администраторов)
 */
export async function settingsCommand(ctx: Context) {
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
      await ctx.reply('❌ Эта команда доступна только администраторам.');
      return;
    }
  } catch (error: any) {
    console.error('[Settings] Error checking admin:', error);
    await ctx.reply('❌ Ошибка при проверке прав администратора.');
    return;
  }

  await showSettingsMenu(ctx);
}

