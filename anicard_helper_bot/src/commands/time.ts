import { Context } from 'telegraf';
import { getGroupSettingsComplete } from '../types/crud/group_settings_complete_crud';

/**
 * Команда /time - показывает текущее время в часовом поясе группы
 */
export async function timeCommand(ctx: Context) {
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

  const groupId = ctx.chat.id;

  try {
    // Получаем настройки группы
    const settings = await getGroupSettingsComplete(groupId);
    const timezone = settings?.groupSettings?.timezone || 'Europe/Kiev';

    // Получаем текущее время в часовом поясе группы
    const now = new Date();
    const localTime = now.toLocaleString('ru-RU', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });

    const dateStr = now.toLocaleDateString('ru-RU', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const timeStr = now.toLocaleTimeString('ru-RU', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    // UTC время для сравнения
    const utcTime = now.toISOString();

    const message = 
      `🕐 <b>Текущее время</b>\n\n` +
      `📅 <b>Дата:</b> ${dateStr}\n` +
      `⏰ <b>Время:</b> ${timeStr}\n` +
      `🌍 <b>Часовой пояс:</b> ${timezone}\n` +
      `\n` +
      `UTC: ${utcTime}`;

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error: any) {
    console.error('[Time] Error:', error);
    await ctx.reply('❌ Произошла ошибка при получении времени.');
  }
}

