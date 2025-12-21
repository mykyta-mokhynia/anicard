import { Context } from 'telegraf';
import {
  showSettingsMenu,
  showIntervalsMenu,
  showHoursMenu,
  showMinutesMenu,
  showTopicsConfigMenu,
  showTopicSettings,
} from '../services/settingsService';
import { showTimezoneMenu, saveTimezone } from '../services/timezoneService';

/**
 * Обработчики callback для меню настроек
 */
export async function handleSettingsCallback(ctx: Context) {
  if (!('data' in ctx.callbackQuery!)) {
    return;
  }

  // Проверяем, что callback из группы (не из личных сообщений)
  if (!ctx.chat || ctx.chat.type === 'private') {
    try {
      await ctx.answerCbQuery('❌ Эта функция доступна только в группах.');
    } catch (e) {
      // Игнорируем ошибки
    }
    return;
  }

  // Проверяем, что это группа или супергруппа
  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
    try {
      await ctx.answerCbQuery('❌ Эта функция доступна только в группах.');
    } catch (e) {
      // Игнорируем ошибки
    }
    return;
  }

  const data = ctx.callbackQuery.data as string;
  const parts = data.split(':');

  if (!ctx.from) {
    await ctx.answerCbQuery('❌ Ошибка: не удалось определить пользователя.');
    return;
  }

  const currentUserId = ctx.from.id;

  // Проверяем права администратора пользователя только для settings и связанных callback'ов
  const isSettingsRelated = 
    (parts[0] === 'menu' && parts[1] === 'command' && parts[2] === 'settings') ||
    (parts[0] === 'menu' && (parts[1] === 'settings' || parts[1] === 'intervals' || parts[1] === 'warns' || parts[1] === 'topics_config' || parts[1] === 'topics_toggle')) ||
    parts[0] === 'interval' ||
    parts[0] === 'topic' ||
    parts[0] === 'warn';

  if (isSettingsRelated) {
    try {
      const member = await ctx.telegram.getChatMember(ctx.chat.id, currentUserId);
      
      if (member.status !== 'administrator' && member.status !== 'creator') {
        await ctx.answerCbQuery('❌ Эта функция доступна только администраторам.');
        return;
      }
    } catch (error: any) {
      console.error('[SettingsCallback] Error checking admin:', error);
      await ctx.answerCbQuery('❌ Ошибка при проверке прав администратора.');
      return;
    }
  } else if (parts[0] === 'menu') {
    // Для остальных menu:* callback'ов проверяем, что это тот же пользователь, который открыл меню
    // Формат: menu:action:userId или menu:action:subaction:userId
    const lastPart = parts[parts.length - 1];
    const menuUserId = parseInt(lastPart, 10);
    
    if (!isNaN(menuUserId) && menuUserId !== currentUserId) {
      await ctx.answerCbQuery('❌ Это меню открыл другой пользователь. Используйте команду /menu для создания своего меню.');
      return;
    }
  }

  try {
    await ctx.answerCbQuery(); // Подтверждаем нажатие кнопки

    switch (parts[0]) {
      case 'menu':
        await handleSettingsAction(ctx, parts[1], parts);
        break;
      case 'interval':
        await handleIntervalAction(ctx, parts);
        break;
      case 'topic':
        await handleTopicAction(ctx, parts);
        break;
      case 'warn':
        await handleWarnAction(ctx, parts);
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
      // Если это menu:main - открываем главное меню, иначе - настройки
      if (parts[0] === 'menu') {
        const { menuCommand } = await import('../commands/menu');
        await menuCommand(ctx);
      } else {
        await showSettingsMenu(ctx);
      }
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
          console.error('[MenuCallback] Error syncing topics:', error);
          await ctx.answerCbQuery('❌ Ошибка синхронизации');
        }
        break;
      case 'warns':
        // Открываем меню настроек варнов
        const { showWarnSettingsMenu } = await import('../services/warnSettingsService');
        await showWarnSettingsMenu(ctx);
        break;
      case 'timezone':
        // Обработка выбора часового пояса
        // Проверка пользователя уже выполнена выше (если это menu:timezone:userId)
        // Если это menu:timezone:set:timezone, то это обрабатывается в settingsService
        if (parts.length >= 4 && parts[2] === 'set') {
          const timezone = parts[3];
          if (!ctx.chat || !('id' in ctx.chat) || !ctx.from) {
            await ctx.answerCbQuery('❌ Ошибка: группа не найдена');
            return;
          }
          // Проверка прав администратора для изменения часового пояса
          try {
            const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
            if (member.status !== 'administrator' && member.status !== 'creator') {
              await ctx.answerCbQuery('❌ Изменение часового пояса доступно только администраторам.');
              return;
            }
          } catch (error: any) {
            console.error('[MenuCallback] Error checking admin:', error);
            await ctx.answerCbQuery('❌ Ошибка при проверке прав администратора.');
            return;
          }
          try {
            await saveTimezone(ctx.chat.id, timezone);
            await ctx.answerCbQuery(`✅ Часовой пояс установлен: ${timezone}`);
            await showTimezoneMenu(ctx);
          } catch (error: any) {
            console.error('[MenuCallback] Error saving timezone:', error);
            await ctx.answerCbQuery('❌ Ошибка при сохранении часового пояса');
          }
        } else {
          await showTimezoneMenu(ctx);
        }
        break;
      case 'close':
        // Закрываем меню (удаляем сообщение)
        // Проверка пользователя уже выполнена выше
        try {
          if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message && 'message_id' in ctx.callbackQuery.message) {
            await ctx.deleteMessage();
          }
        } catch (error: any) {
          console.error('[MenuCallback] Error deleting message:', error);
          // Игнорируем ошибки удаления
        }
        break;
      case 'command':
        // Обработка команд из меню
        if (parts.length >= 3) {
          const command = parts[2];
          switch (command) {
            case 'top':
              // Открываем команду /top (редактируем сообщение меню)
              const { topCommand } = await import('../commands/top');
              await topCommand(ctx);
              break;
            case 'users':
              // Открываем команду /users (редактируем сообщение меню)
              const { usersCommand, showUsersList } = await import('../commands/users');
              if (!ctx.chat || !('id' in ctx.chat)) {
                await ctx.answerCbQuery('❌ Ошибка: группа не найдена');
                return;
              }
              await showUsersList(ctx, ctx.chat.id, 0);
              break;
            case 'settings':
              // Открываем меню настроек (редактируем сообщение меню)
              await showSettingsMenu(ctx);
              break;
            default:
              await ctx.answerCbQuery('❌ Неизвестная команда');
          }
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
          timezone: 'Europe/Kiev', // Часовой пояс по умолчанию
        },
        topics: [],
      };
    } else {
      // Обновляем существующие настройки
      settings.groupSettings.collectionIntervalHours = hours;
      settings.groupSettings.collectionIntervalMinutes = minutes;
      // Сохраняем timezone, если его еще нет
      if (!settings.groupSettings.timezone) {
        settings.groupSettings.timezone = 'Europe/Kiev';
      }
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
          if (!topicComplete.topicFeature) {
            await ctx.answerCbQuery('❌ Ошибка: не удалось создать настройки темы');
            return;
          }
          
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
            case 'warn_reports':
              // Переключаем тему для отчетов о варнах
              const { getWarnSettings, saveWarnSettings } = await import('../services/warnService');
              const warnSettings = await getWarnSettings(groupId);
              
              if (warnSettings?.reportTopicId === topicId) {
                // Убираем тему из настроек варнов
                await saveWarnSettings(
                  groupId,
                  warnSettings.reportGroupId,
                  undefined,
                  warnSettings.normPoints,
                  warnSettings.enabled
                );
                await ctx.answerCbQuery('❌ Тема отключена для отчетов о варнах');
              } else {
                // Устанавливаем эту тему для отчетов о варнах
                await saveWarnSettings(
                  groupId,
                  warnSettings?.reportGroupId || groupId,
                  topicId,
                  warnSettings?.normPoints || 90,
                  warnSettings?.enabled ?? true
                );
                await ctx.answerCbQuery('✅ Тема установлена для отчетов о варнах');
              }
              // Обновляем меню настроек темы
              const { selectQuery } = await import('../db');
              const topicQuery = `
                SELECT topic_name FROM group_topics 
                WHERE group_id = ? AND topic_id = ?
                LIMIT 1
              `;
              const topic = await selectQuery(topicQuery, [groupId, topicId], false);
              const topicName = topic?.topicName || `Тема ${topicId}`;
              const { showTopicSettings } = await import('../services/settingsService');
              await showTopicSettings(ctx, topicId, topicName);
              return; // Не продолжаем дальше, так как уже обновили меню
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

/**
 * Обработчик действий с варнами
 */
async function handleWarnAction(ctx: Context, parts: string[]) {
  if (!ctx.chat || !('id' in ctx.chat)) {
    await ctx.answerCbQuery('❌ Ошибка: группа не найдена');
    return;
  }

  const groupId = ctx.chat.id;
  const { showWarnSettingsMenu, showNormSettingsMenu, showWarnStats } = await import('../services/warnSettingsService');
  const { getWarnSettings, saveWarnSettings } = await import('../services/warnService');
  const { selectQuery, executeQuery } = await import('../db');

  switch (parts[1]) {
    case 'main':
      await showWarnSettingsMenu(ctx);
      break;
    case 'toggle':
      // Включить/выключить систему варнов
      const currentSettings = await getWarnSettings(groupId);
      const newEnabled = !(currentSettings?.enabled || false);
      
      // Если включаем и нет настроек группы для отчетов, устанавливаем текущую группу
      if (newEnabled && !currentSettings?.reportGroupId) {
        await saveWarnSettings(groupId, groupId, undefined, currentSettings?.normPoints || 90, true);
      } else {
        await saveWarnSettings(
          groupId,
          currentSettings?.reportGroupId,
          currentSettings?.reportTopicId,
          currentSettings?.normPoints || 90,
          newEnabled
        );
      }
      
      await ctx.answerCbQuery(newEnabled ? '✅ Система варнов включена' : '❌ Система варнов выключена');
      await showWarnSettingsMenu(ctx);
      break;
    case 'norm':
      if (parts[2] === 'set' && parts[3]) {
        // Обработка warn:norm:set:90
        const norm = parseInt(parts[3], 10);
        if (isNaN(norm) || norm < 0 || norm > 1000) {
          await ctx.answerCbQuery('❌ Некорректное значение нормы');
          return;
        }
        const settings = await getWarnSettings(groupId);
        await saveWarnSettings(groupId, settings?.reportGroupId, settings?.reportTopicId, norm, settings?.enabled);
        await ctx.answerCbQuery(`✅ Норма установлена: ${norm}🔹`);
        await showNormSettingsMenu(ctx);
      } else {
        await showNormSettingsMenu(ctx);
      }
      break;
    case 'report_group':
      // Настройка группы для отчетов
      const settings = await getWarnSettings(groupId);
      const currentReportGroup = settings?.reportGroupId || groupId;
      const currentReportTopic = settings?.reportTopicId;

      let message = 
        `📤 <b>Настройка группы для отчетов</b>\n\n` +
        `📊 <b>Текущая группа:</b> ${currentReportGroup}\n`;
      
      if (currentReportTopic) {
        message += `📑 <b>Текущая тема:</b> ID ${currentReportTopic}\n`;
      }
      
      message += `\n💡 Для настройки группы отправьте команду:\n`;
      message += `<code>/warn_set_report_group GROUP_ID TOPIC_ID</code>\n\n`;
      message += `где GROUP_ID - ID группы (отрицательное число),\n`;
      message += `TOPIC_ID - ID темы (опционально, можно не указывать).`;

      const { Markup } = await import('telegraf');
      const keyboard = [
        [Markup.button.callback('◀️ Назад', 'warn:main')]
      ];

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
      break;
    case 'stats':
      await showWarnStats(ctx);
      break;
    case 'delete_all':
      // Удаление всех варнов
      const deleteQuery = `DELETE FROM user_warns WHERE group_id = ?`;
      await executeQuery(deleteQuery, [groupId]);
      await ctx.answerCbQuery('✅ Все варны удалены');
      await showWarnSettingsMenu(ctx);
      break;
    default:
      console.warn(`[SettingsCallback] Unknown warn action: ${parts.join(':')}`);
  }
}

