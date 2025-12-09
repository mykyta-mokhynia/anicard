import { Context } from 'telegraf';
import {
  showSettingsMenu,
  showIntervalsMenu,
  showHoursMenu,
  showMinutesMenu,
  showTopicsConfigMenu,
  showTopicSettings,
} from '../services/settingsService';

/**
 * Обработчики callback для меню настроек
 */
export async function handleSettingsCallback(ctx: Context) {
  if (!('data' in ctx.callbackQuery!)) {
    return;
  }

  const data = ctx.callbackQuery.data as string;
  const parts = data.split(':');

  try {
    await ctx.answerCbQuery(); // Подтверждаем нажатие кнопки

    switch (parts[0]) {
      case 'settings':
        await handleSettingsAction(ctx, parts[1], parts);
        break;
      case 'interval':
        await handleIntervalAction(ctx, parts);
        break;
      case 'topic':
        await handleTopicAction(ctx, parts);
        break;
      default:
        console.warn(`[SettingsCallback] Unknown action: ${data}`);
    }
  } catch (error: any) {
    console.error(`[SettingsCallback] Error handling ${data}:`, error);
    try {
      await ctx.answerCbQuery('❌ Произошла ошибка');
    } catch (cbError) {
      // Игнорируем ошибки ответа на callback
    }
  }
}

async function handleSettingsAction(ctx: Context, action: string, parts: string[]) {
  switch (action) {
    case 'main':
      await showSettingsMenu(ctx);
      break;
    case 'intervals':
      await showIntervalsMenu(ctx);
      break;
    case 'topics_toggle':
      // TODO: Переключить режим тем
      await ctx.answerCbQuery('🔄 Режим тем переключен');
      await showSettingsMenu(ctx);
      break;
    case 'topics_config':
      // Обработка пагинации: settings:topics_config:page:0
      if (parts.length >= 4 && parts[2] === 'page') {
        const page = parseInt(parts[3], 10) || 0;
        await showTopicsConfigMenu(ctx, page);
      } else {
        await showTopicsConfigMenu(ctx, 0);
      }
      break;
    case 'topics_sync':
      // Синхронизация тем из Telegram
      if (!ctx.chat || !('id' in ctx.chat)) {
        await ctx.answerCbQuery('❌ Ошибка: группа не найдена');
        return;
      }
      const { syncTopicsFromTelegram } = await import('../services/topicsService');
      await ctx.answerCbQuery('🔄 Синхронизация...');
      try {
        const synced = await syncTopicsFromTelegram(ctx, ctx.chat.id);
        await ctx.answerCbQuery(`✅ Синхронизировано тем: ${synced.length}`);
        await showTopicsConfigMenu(ctx, 0);
      } catch (error: any) {
        console.error('[SettingsCallback] Error syncing topics:', error);
        await ctx.answerCbQuery('❌ Ошибка синхронизации');
      }
      break;
    case 'close':
      await ctx.deleteMessage();
      break;
    default:
      console.warn(`[SettingsCallback] Unknown settings action: ${action}`);
  }
}

async function handleIntervalAction(ctx: Context, parts: string[]) {
  if (parts.length < 2) return;

  if (!ctx.chat || !('id' in ctx.chat)) {
    return;
  }

  const groupId = ctx.chat.id;

  switch (parts[1]) {
    case '1h':
      await saveInterval(groupId, 1, 0);
      await ctx.answerCbQuery('✅ Интервал установлен: 1 час');
      await showIntervalsMenu(ctx);
      break;
    case '2h':
      await saveInterval(groupId, 2, 0);
      await ctx.answerCbQuery('✅ Интервал установлен: 2 часа');
      await showIntervalsMenu(ctx);
      break;
    case '4h':
      await saveInterval(groupId, 4, 0);
      await ctx.answerCbQuery('✅ Интервал установлен: 4 часа');
      await showIntervalsMenu(ctx);
      break;
    case 'hours_menu':
      await showHoursMenu(ctx);
      break;
    case 'minutes_menu':
      await showMinutesMenu(ctx);
      break;
    case 'hour':
      if (parts[2]) {
        const hours = parseInt(parts[2], 10);
        if (isNaN(hours) || hours < 0 || hours > 24) {
          await ctx.answerCbQuery('❌ Некорректное значение часов');
          return;
        }
        // Получаем текущие минуты
        const { getGroupSettingsComplete } = await import('../types/crud/group_settings_complete_crud');
        const settings = await getGroupSettingsComplete(groupId);
        const currentMinutes = settings?.groupSettings?.collectionIntervalMinutes !== undefined 
          ? settings.groupSettings.collectionIntervalMinutes 
          : 0;
        await saveInterval(groupId, hours, currentMinutes);
        await ctx.answerCbQuery(`✅ Установлено: ${hours} часов`);
        await showHoursMenu(ctx);
      }
      break;
    case 'minute':
      if (parts[2]) {
        const minutes = parseInt(parts[2], 10);
        if (isNaN(minutes) || minutes < 0 || minutes > 60) {
          await ctx.answerCbQuery('❌ Некорректное значение минут');
          return;
        }
        // Получаем текущие часы
        const { getGroupSettingsComplete } = await import('../types/crud/group_settings_complete_crud');
        const settings = await getGroupSettingsComplete(groupId);
        const currentHours = settings?.groupSettings?.collectionIntervalHours !== undefined 
          ? settings.groupSettings.collectionIntervalHours 
          : 2;
        await saveInterval(groupId, currentHours, minutes);
        await ctx.answerCbQuery(`✅ Установлено: ${minutes} минут`);
        await showMinutesMenu(ctx);
      }
      break;
    default:
      console.warn(`[SettingsCallback] Unknown interval action: ${parts.join(':')}`);
  }
}

/**
 * Сохраняет интервал в базу данных
 */
async function saveInterval(groupId: number, hours: number, minutes: number) {
  try {
    const { getGroupSettingsComplete, saveGroupSettingsComplete } = await import('../types/crud/group_settings_complete_crud');
    let settings = await getGroupSettingsComplete(groupId);
    
    if (!settings) {
      // Создаем новые настройки
      settings = {
        groupSettings: {
          groupId,
          collectionIntervalHours: hours,
          collectionIntervalMinutes: minutes,
          topicsModeEnabled: false,
        },
        topics: [],
      };
    } else {
      // Обновляем существующие настройки
      settings.groupSettings.collectionIntervalHours = hours;
      settings.groupSettings.collectionIntervalMinutes = minutes;
    }
    
    await saveGroupSettingsComplete(settings);
    console.log(`[SettingsCallback] ✅ Saved interval: ${hours}h ${minutes}m for group ${groupId}`);
  } catch (error: any) {
    console.error('[SettingsCallback] Error saving interval:', error);
    throw error;
  }
}

async function handleTopicAction(ctx: Context, parts: string[]) {
  if (parts.length < 2) return;

  switch (parts[1]) {
    case 'config':
      if (parts[2]) {
        const topicId = parseInt(parts[2], 10);
        // Получаем название темы из базы данных
        if (!ctx.chat || !('id' in ctx.chat)) {
          await ctx.answerCbQuery('❌ Ошибка: группа не найдена');
          return;
        }
        const groupId = ctx.chat.id;
        const { selectQuery } = await import('../db');
        const topicQuery = `
          SELECT topic_name FROM group_topics 
          WHERE group_id = ? AND topic_id = ?
          LIMIT 1
        `;
        const topic = await selectQuery(topicQuery, [groupId, topicId], false);
        const topicName = topic?.topicName || `Тема ${topicId}`;
        await showTopicSettings(ctx, topicId, topicName);
      }
      break;
    case 'feature':
      if (parts.length >= 5 && parts[2] === 'toggle') {
        const topicId = parseInt(parts[3], 10);
        const featureId = parts[4];
        
        if (!ctx.chat || !('id' in ctx.chat)) {
          await ctx.answerCbQuery('❌ Ошибка: группа не найдена');
          return;
        }
        
        const groupId = ctx.chat.id;
        
        try {
          // Загружаем текущие настройки темы
          const { getTopicComplete, saveTopicComplete } = await import('../types/crud/topic_complete_crud');
          let topicComplete = await getTopicComplete(groupId, topicId);
          
          // Если настроек нет, создаем новую запись
          if (!topicComplete) {
            // Загружаем информацию о теме
            const { selectQuery } = await import('../db');
            const topicQuery = `
              SELECT topic_name FROM group_topics 
              WHERE group_id = ? AND topic_id = ?
              LIMIT 1
            `;
            const topic = await selectQuery(topicQuery, [groupId, topicId], false);
            
            if (!topic) {
              await ctx.answerCbQuery('❌ Тема не найдена');
              return;
            }
            
            topicComplete = {
              groupTopic: {
                groupId,
                topicId,
                topicName: topic.topicName || `Тема ${topicId}`,
              },
              topicFeature: {
                groupId,
                topicId,
                featurePolls: false,
                featureTop: false,
                featureGroupCollection: false,
              },
            };
          }
          
          // Если функционал еще не создан, создаем его
          if (!topicComplete.topicFeature) {
            topicComplete.topicFeature = {
              groupId,
              topicId,
              featurePolls: false,
              featureTop: false,
              featureGroupCollection: false,
            };
          }
          
          // Переключаем нужную функцию
          switch (featureId) {
            case 'polls':
              topicComplete.topicFeature.featurePolls = !topicComplete.topicFeature.featurePolls;
              break;
            case 'top':
              topicComplete.topicFeature.featureTop = !topicComplete.topicFeature.featureTop;
              break;
            case 'group_collection':
              topicComplete.topicFeature.featureGroupCollection = !topicComplete.topicFeature.featureGroupCollection;
              break;
            default:
              await ctx.answerCbQuery('❌ Неизвестная функция');
              return;
          }
          
          // Сохраняем изменения
          await saveTopicComplete(topicComplete);
          
          // Получаем название темы для отображения
          const topicName = topicComplete.groupTopic.topicName || `Тема ${topicId}`;
          
          await ctx.answerCbQuery('🔄 Настройка обновлена');
          await showTopicSettings(ctx, topicId, topicName);
        } catch (error: any) {
          console.error('[SettingsCallback] Error toggling feature:', error);
          await ctx.answerCbQuery('❌ Ошибка при обновлении настройки');
        }
      }
      break;
    default:
      console.warn(`[SettingsCallback] Unknown topic action: ${parts.join(':')}`);
  }
}

