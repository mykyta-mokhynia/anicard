import { Context, Telegraf } from 'telegraf';
import { createDailyPolls } from '../services/pollsService';
import { sendDailyTop } from '../services/topService';
import { createCollectionMessages } from '../services/groupCollectionService';
import { getGroupSettingsComplete } from '../types/crud/group_settings_complete_crud';
import { getGroupsWithPollsEnabled } from '../services/pollsService';
import { getGroupsWithTopEnabled } from '../services/topService';
import { getGroupsWithCollectionEnabled } from '../services/groupCollectionService';
import { canSendCollectionNow } from '../utils/timeHelpers';

/**
 * Команда /startcycle - запускает полный цикл для группы:
 * 1. Создает опросники (polls)
 * 2. Отправляет топ за день (top)
 * 3. Запускает интервалы для групп (collection)
 * 
 * Только для администраторов
 */
export async function startCycleCommand(ctx: Context) {
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
    console.error('[StartCycle] Error checking admin:', error);
    await ctx.reply('❌ Ошибка при проверке прав администратора.');
    return;
  }

  const groupId = ctx.chat.id;

  try {
    const results: string[] = [];
    
    // Получаем bot из глобального контекста
    const bot = (global as any).__bot as Telegraf;
    if (!bot) {
      await ctx.reply('❌ Ошибка: не удалось получить bot объект.');
      return;
    }
    
    // 1. Создание опросников - для всех тем, где включены polls
    try {
      const groupsWithPolls = await getGroupsWithPollsEnabled();
      const groupPolls = groupsWithPolls.filter(g => g.groupId === groupId);
      
      if (groupPolls.length > 0) {
        let pollsCreated = 0;
        for (const groupPoll of groupPolls) {
          try {
            await createDailyPolls(ctx, groupId, groupPoll.topicId);
            pollsCreated++;
            console.log(`[StartCycle] ✅ Created polls for group ${groupId}, topic ${groupPoll.topicId} (${groupPoll.topicName || 'N/A'})`);
          } catch (error: any) {
            console.error(`[StartCycle] Error creating polls for topic ${groupPoll.topicId}:`, error);
          }
        }
        if (pollsCreated > 0) {
          results.push(`✅ Опросники созданы для ${pollsCreated} тем(ы)`);
        } else {
          results.push('⚠️ Не удалось создать опросники');
        }
      } else {
        results.push('ℹ️ Опросники не включены ни для одной темы');
      }
    } catch (error: any) {
      console.error('[StartCycle] Error creating polls:', error);
      results.push('❌ Ошибка при создании опросников');
    }

    // 2. Отправка топа за день (вчерашний день) - для всех тем, где включен top
    try {
      const groupsWithTop = await getGroupsWithTopEnabled();
      const groupTops = groupsWithTop.filter(g => g.groupId === groupId);
      
      // Получаем настройки для определения часового пояса
      const settings = await getGroupSettingsComplete(groupId);
      const groupTimezone = settings?.groupSettings?.timezone || 'Europe/Kiev';
      
      // Получаем вчерашнюю дату в часовом поясе группы
      const now = new Date();
      const { getDateStringInTimezone } = await import('../utils/dateHelpers');
      // Получаем текущую дату в часовом поясе группы
      const todayDateStr = getDateStringInTimezone(groupTimezone);
      // Создаем Date объект для вчерашнего дня
      const todayDate = new Date(todayDateStr + 'T00:00:00');
      const yesterdayDate = new Date(todayDate);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayDateStr = getDateStringInTimezone(groupTimezone, yesterdayDate);
      const yesterday = new Date(yesterdayDateStr + 'T00:00:00');
      
      if (groupTops.length > 0) {
        let topsSent = 0;
        for (const groupTop of groupTops) {
          try {
            await sendDailyTop(bot, groupId, groupTop.topicId, yesterday);
            topsSent++;
            console.log(`[StartCycle] ✅ Sent daily top for group ${groupId}, topic ${groupTop.topicId} (${groupTop.topicName || 'N/A'})`);
          } catch (error: any) {
            console.error(`[StartCycle] Error sending top for topic ${groupTop.topicId}:`, error);
          }
        }
        if (topsSent > 0) {
          results.push(`✅ Топ за вчера отправлен в ${topsSent} тем(ы)`);
        } else {
          results.push('⚠️ Не удалось отправить топ');
        }
      } else {
        results.push('ℹ️ Топ не включен ни для одной темы');
      }
    } catch (error: any) {
      console.error('[StartCycle] Error sending top:', error);
      results.push('❌ Ошибка при отправке топа');
    }

    // 3. Запуск интервалов для групп - для всех тем, где включен collection
    try {
      const groupsWithCollection = await getGroupsWithCollectionEnabled();
      const groupCollections = groupsWithCollection.filter(g => g.groupId === groupId);
      
      if (groupCollections.length > 0) {
        const settings = await getGroupSettingsComplete(groupId);
        
        if (settings?.groupSettings) {
          const intervalHours = settings.groupSettings.collectionIntervalHours ?? 2;
          const intervalMinutes = settings.groupSettings.collectionIntervalMinutes ?? 0;
          const groupTimezone = settings.groupSettings.timezone || 'Europe/Kiev';
          
          // Проверяем, нужно ли отправлять сейчас (с учетом времени от 00:00 по часовому поясу группы)
          const { canSend, expectedTime, timeSinceExpected } = canSendCollectionNow(intervalHours, intervalMinutes, groupTimezone);
          
          let collectionsSent = 0;
          let collectionsSkipped = 0;
          
          for (const groupCollection of groupCollections) {
            try {
              // Проверяем, не было ли уже отправлено сообщение для этого интервала
              const { selectQuery } = await import('../db');
              const lastCallQuery = `
                SELECT status, scheduled_time, battle_type
                FROM group_collection_calls
                WHERE group_id = ? AND topic_id = ?
                ORDER BY id DESC
                LIMIT 2
              `;
              const lastCalls = await selectQuery(lastCallQuery, [groupId, groupCollection.topicId]);
              
              let shouldSend = canSend;
              
              if (lastCalls && lastCalls.length > 0) {
                const tolerance = 60 * 1000; // 1 минута
                const recentActiveCall = lastCalls.find((call: any) => {
                  const callTime = new Date(call.scheduledTime);
                  const timeDiff = Math.abs(callTime.getTime() - expectedTime.getTime());
                  return call.status !== 'cancelled' && timeDiff < tolerance;
                });
                
                if (recentActiveCall) {
                  shouldSend = false;
                }
              }
              
              if (shouldSend) {
                await createCollectionMessages(ctx, groupId, groupCollection.topicId);
                collectionsSent++;
                console.log(`[StartCycle] ✅ Created collection messages for group ${groupId}, topic ${groupCollection.topicId} (${groupCollection.topicName || 'N/A'})`);
              } else {
                collectionsSkipped++;
              }
            } catch (error: any) {
              console.error(`[StartCycle] Error creating collection for topic ${groupCollection.topicId}:`, error);
            }
          }
          
          if (collectionsSent > 0) {
            results.push(`✅ Созыв групп отправлен в ${collectionsSent} тем(ы)`);
          }
          if (collectionsSkipped > 0) {
            const minutesUntilNext = Math.round(Math.abs(timeSinceExpected) / 60000);
            results.push(`⏰ Созыв групп: ${collectionsSkipped} тем(ы) пропущено (не время, до следующего интервала ~${minutesUntilNext} мин.)`);
          }
          if (collectionsSent === 0 && collectionsSkipped === 0) {
            results.push('⚠️ Не удалось отправить созывы групп');
          }
        } else {
          results.push('ℹ️ Настройки интервала не найдены');
        }
      } else {
        results.push('ℹ️ Сбор групп не включен ни для одной темы');
      }
    } catch (error: any) {
      console.error('[StartCycle] Error creating collection:', error);
      results.push('❌ Ошибка при запуске интервалов');
    }

    // Отправляем результат
    const resultMessage = 
      `🔄 <b>Результат запуска цикла</b>\n\n` +
      results.join('\n');
    
    await ctx.reply(resultMessage, { parse_mode: 'HTML' });
    
    console.log(`[StartCycle] ✅ Cycle completed for group ${groupId}`);
  } catch (error: any) {
    console.error('[StartCycle] Error:', error);
    await ctx.reply('❌ Произошла ошибка при запуске цикла.');
  }
}

