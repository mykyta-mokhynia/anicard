import { Context, Markup } from 'telegraf';
import { getGroupSettingsComplete, saveGroupSettingsComplete } from '../types/crud/group_settings_complete_crud';

/**
 * Популярные часовые пояса для выбора
 */
export const POPULAR_TIMEZONES = [
  { value: 'Europe/Kiev', label: '🇺🇦 Киев (UTC+2/+3)', offset: '+02:00' },
  { value: 'Europe/Moscow', label: '🇷🇺 Москва (UTC+3)', offset: '+03:00' },
  { value: 'Europe/Warsaw', label: '🇵🇱 Варшава (UTC+1/+2)', offset: '+01:00' },
  { value: 'Europe/Berlin', label: '🇩🇪 Берлин (UTC+1/+2)', offset: '+01:00' },
  { value: 'Europe/London', label: '🇬🇧 Лондон (UTC+0/+1)', offset: '+00:00' },
  { value: 'America/New_York', label: '🇺🇸 Нью-Йорк (UTC-5/-4)', offset: '-05:00' },
  { value: 'Asia/Dubai', label: '🇦🇪 Дубай (UTC+4)', offset: '+04:00' },
  { value: 'Asia/Tashkent', label: '🇺🇿 Ташкент (UTC+5)', offset: '+05:00' },
  { value: 'UTC', label: '🌐 UTC (UTC+0)', offset: '+00:00' },
];

/**
 * Показывает меню выбора часового пояса
 */
export async function showTimezoneMenu(ctx: Context) {
  if (!ctx.chat || !('id' in ctx.chat)) {
    return;
  }

  const groupId = ctx.chat.id;

  // Получаем текущий часовой пояс
  let currentTimezone = 'Europe/Kiev';
  try {
    const settings = await getGroupSettingsComplete(groupId);
    if (settings?.groupSettings?.timezone) {
      currentTimezone = settings.groupSettings.timezone;
    }
  } catch (error) {
    console.error('[TimezoneService] Error loading settings:', error);
  }

  const message = 
    `🌍 <b>Выбор часового пояса</b>\n\n` +
    `📊 <b>Текущий часовой пояс:</b> ${currentTimezone}\n\n` +
    `Выберите часовой пояс для группы:`;

  const keyboard: any[] = [];

  // Создаем кнопки для каждого часового пояса
  POPULAR_TIMEZONES.forEach(tz => {
    const isSelected = tz.value === currentTimezone;
    keyboard.push([
      Markup.button.callback(
        isSelected ? `✅ ${tz.label}` : tz.label,
        `menu:timezone:set:${tz.value}`
      )
    ]);
  });

  // Назад (возвращаемся в главное меню)
  // Определяем user_id из callback_query, если есть
  let backCallback = 'menu:main';
  if (ctx.callbackQuery && 'from' in ctx.callbackQuery && ctx.callbackQuery.from) {
    const userId = ctx.callbackQuery.from.id;
    // Если это menu:timezone:userId, то возвращаемся с user_id
    if ('data' in ctx.callbackQuery && ctx.callbackQuery.data) {
      const data = ctx.callbackQuery.data as string;
      const parts = data.split(':');
      if (parts.length >= 3 && parts[0] === 'menu' && parts[1] === 'timezone') {
        // Проверяем, есть ли user_id в конце
        const lastPart = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastPart) && lastPart === userId) {
          backCallback = `menu:main:${userId}`;
        }
      }
    }
  }
  keyboard.push([
    Markup.button.callback('◀️ Назад', backCallback)
  ]);

  try {
    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
    });
  } catch (error: any) {
    if (error.response?.error_code === 400 && 
        error.response?.description?.includes('message is not modified')) {
      return;
    }
    throw error;
  }
}

/**
 * Сохраняет часовой пояс группы
 */
export async function saveTimezone(groupId: number, timezone: string) {
  try {
    const settings = await getGroupSettingsComplete(groupId);
    
    if (!settings) {
      // Создаем новые настройки
      const newSettings = {
        groupSettings: {
          groupId,
          collectionIntervalHours: 2,
          collectionIntervalMinutes: 0,
          topicsModeEnabled: false,
          timezone,
        },
        topics: [],
      };
      await saveGroupSettingsComplete(newSettings);
    } else {
      // Обновляем существующие настройки
      settings.groupSettings.timezone = timezone;
      await saveGroupSettingsComplete(settings);
    }
    
    console.log(`[TimezoneService] ✅ Saved timezone: ${timezone} for group ${groupId}`);
  } catch (error: any) {
    console.error('[TimezoneService] Error saving timezone:', error);
    throw error;
  }
}

