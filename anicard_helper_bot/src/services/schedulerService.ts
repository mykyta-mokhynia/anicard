import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import { createDailyPolls, getGroupsWithPollsEnabled } from './pollsService';
import { cleanupOldPollData } from './pollAnswersService';
import { createCollectionMessages, getGroupsWithCollectionEnabled } from './groupCollectionService';
import { getGroupSettingsComplete } from '../types/crud/group_settings_complete_crud';

/**
 * Инициализирует планировщик задач для ежедневных опросников
 */
export function initScheduler(bot: Telegraf) {
  // Проверяем каждую минуту, нужно ли создавать опросники для групп
  // Это позволяет каждой группе создавать опросники в 00:00 по своему часовому поясу
  cron.schedule('* * * * *', async () => {
    await executeDailyPollsIfNeeded(bot);
  });

  // Проверяем каждую минуту, нужно ли отправлять топ
  // Это позволяет каждой группе отправлять топ в 00:00 по своему часовому поясу
  cron.schedule('* * * * *', async () => {
    await executeDailyTopIfNeeded(bot);
  });

  // Проверяем каждую минуту, нужно ли отправлять напоминания
  // Это позволяет каждой группе отправлять напоминания по своему часовому поясу
  cron.schedule('* * * * *', async () => {
    await executeRemindersIfNeeded(bot);
  });

  // Проверяем каждую минуту, нужно ли проверять варны
  // Это позволяет каждой группе проверять варны в 00:00 по своему часовому поясу
  cron.schedule('* * * * *', async () => {
    await executeWarnsCheckIfNeeded(bot);
  });

  // Очистка старых данных опросников (каждый день в 03:00 по UTC)
  // Это техническая задача, не зависит от часового пояса группы
  cron.schedule('0 0 3 * * *', async () => {
    console.log('[Scheduler] 🧹 Cleaning up old poll data (older than 60 days)');
    try {
      await cleanupOldPollData();
      console.log('[Scheduler] ✅ Old poll data cleanup completed');
    } catch (error: any) {
      console.error('[Scheduler] ❌ Error cleaning up old poll data:', error);
    }
  });

  // Планировщик для созыва групп (проверяет каждую минуту)
  initGroupCollectionScheduler(bot);

  console.log(`[Scheduler] ✅ Scheduler initialized (polls, top, reminders and warns checked every minute based on group timezone, cleanup at 03:00 UTC)`);
}

/**
 * Проверяет и выдает варны для групп, у которых сейчас 00:00 по их часовому поясу
 */
async function executeWarnsCheckIfNeeded(bot: Telegraf) {
  try {
    const { getGroupsWithWarnsEnabled } = await import('./warnService');
    const groups = await getGroupsWithWarnsEnabled();
    
    if (groups.length === 0) {
      return;
    }

    const now = new Date();

    for (const group of groups) {
      const groupId = group.groupId;
      const reportGroupId = group.reportGroupId;
      const reportTopicId = group.reportTopicId;
      try {
        // Получаем настройки группы для определения часового пояса
        const settings = await getGroupSettingsComplete(groupId);
        if (!settings?.groupSettings) {
          continue;
        }

        const timezone = settings.groupSettings.timezone || 'Europe/Kiev';

        // Получаем текущее время в часовом поясе группы
        const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        const localHours = localTime.getHours();
        const localMinutes = localTime.getMinutes();

        // Проверяем, наступило ли 00:00 по часовому поясу группы
        // Проверяем только первые 2 минуты часа (00:00-00:02), чтобы не создавать дубликаты
        if (localHours === 0 && localMinutes <= 2) {
          console.log(`[Scheduler] ⚠️ Checking warns for group ${groupId} (timezone: ${timezone}, local time: ${localHours}:${String(localMinutes).padStart(2, '0')})`);

          const { checkAndGiveWarns, sendWarnReportToGroup } = await import('./warnService');
          
          // Проверяем и выдаем варны
          await checkAndGiveWarns(groupId, timezone);
          console.log(`[Scheduler] ✅ Checked warns for group ${groupId}`);

          // Отправляем отчет о варнах в настроенную группу
          await sendWarnReportToGroup(bot, groupId, reportGroupId, reportTopicId, timezone);
          console.log(`[Scheduler] ✅ Sent warn report for group ${groupId} to report group ${reportGroupId}`);
        }
      } catch (error: any) {
        console.error(`[Scheduler] ❌ Error checking warns for group ${groupId}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error('[Scheduler] ❌ Error in warns check:', error);
  }
}

/**
 * Проверяет и отправляет напоминания пользователям, которые не отыграли
 * Отправляет за 2 часа до конца дня (22:00), за 1 час (23:00), и каждые 10 минут до конца (23:10, 23:20, 23:30, 23:40, 23:50)
 */
async function executeRemindersIfNeeded(bot: Telegraf) {
  try {
    const { getGroupsWithPollsEnabledForReminders } = await import('./reminderService');
    const groups = await getGroupsWithPollsEnabledForReminders();
    
    if (groups.length === 0) {
      return;
    }

    const now = new Date();

    for (const group of groups) {
      try {
        // Получаем настройки группы для определения часового пояса
        const settings = await getGroupSettingsComplete(group.groupId);
        if (!settings?.groupSettings) {
          continue;
        }

        const timezone = settings.groupSettings.timezone || 'Europe/Kiev';

        // Получаем текущее время в часовом поясе группы
        const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        const localHours = localTime.getHours();
        const localMinutes = localTime.getMinutes();

        // Определяем, нужно ли отправлять напоминание
        // 22:00 - за 2 часа до конца дня
        // 23:00 - за 1 час до конца дня
        // 23:10, 23:20, 23:30, 23:40, 23:50 - каждые 10 минут до конца дня
        let shouldSendReminder = false;

        if (localHours === 22 && localMinutes === 0) {
          // За 2 часа до конца дня (22:00) - точно в 00 секунд
          shouldSendReminder = true;
        } else if (localHours === 23) {
          if (localMinutes === 0) {
            // За 1 час до конца дня (23:00) - точно в 00 секунд
            shouldSendReminder = true;
          } else if (localMinutes === 10 || localMinutes === 20 || localMinutes === 30 || localMinutes === 40 || localMinutes === 50) {
            // Каждые 10 минут: 23:10, 23:20, 23:30, 23:40, 23:50 - точно в 00 секунд
            const localSeconds = localTime.getSeconds();
            if (localSeconds === 0 || localSeconds === 1) { // Небольшой допуск для выполнения
              shouldSendReminder = true;
            }
          }
        }

        if (shouldSendReminder) {
          // Проверяем, не отправляли ли мы уже напоминание в эту минуту
          // Для этого можно использовать простую проверку по времени
          // Или добавить таблицу отправленных напоминаний, но пока используем простой подход
          
          const { sendReminderToNonPlayers } = await import('./reminderService');
          
          console.log(`[Scheduler] 📢 Sending reminder for group ${group.groupId} (timezone: ${timezone}, local time: ${localHours}:${String(localMinutes).padStart(2, '0')})`);
          
          await sendReminderToNonPlayers(bot, group.groupId, group.topicId, group.topicName);
          console.log(`[Scheduler] ✅ Sent reminder for group ${group.groupId}, topic ${group.topicId} (${group.topicName || 'N/A'})`);
        }
      } catch (error: any) {
        console.error(`[Scheduler] ❌ Error sending reminder for group ${group.groupId}${group.topicId ? `, topic ${group.topicId}` : ''}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error('[Scheduler] ❌ Error in reminders check:', error);
  }
}

/**
 * Проверяет и создает опросники для групп, у которых сейчас 00:00 по их часовому поясу
 */
async function executeDailyPollsIfNeeded(bot: Telegraf) {
  try {
    const groups = await getGroupsWithPollsEnabled();
    
    if (groups.length === 0) {
      return;
    }

    const now = new Date();

    for (const group of groups) {
      try {
        // Получаем настройки группы для определения часового пояса
        const settings = await getGroupSettingsComplete(group.groupId);
        if (!settings?.groupSettings) {
          continue;
        }

        const timezone = settings.groupSettings.timezone || 'Europe/Kiev';

        // Получаем текущее время в часовом поясе группы
        const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        const localHours = localTime.getHours();
        const localMinutes = localTime.getMinutes();

        // Проверяем, наступило ли 00:00 по часовому поясу группы (с небольшой задержкой для выполнения)
        // Проверяем только первые 2 минуты часа (00:00-00:02), чтобы не создавать дубликаты
        if (localHours === 0 && localMinutes <= 2) {
          // Проверяем, не созданы ли уже опросники сегодня
          const { getGroupDateString } = await import('../utils/pollDateHelpers');
          const todayDate = await getGroupDateString(group.groupId);
          
          const { selectQuery } = await import('../db');
          const existingPoll = await selectQuery(
            `SELECT id FROM polls WHERE group_id = ? AND poll_type = ? AND poll_date = ? LIMIT 1`,
            [group.groupId, 'clan_battles', todayDate],
            false
          );

          if (existingPoll) {
            // Опросники уже созданы сегодня
            continue;
          }

          // Создаем контекст для отправки опросников
          const ctx = {
            telegram: bot.telegram,
          } as any;

          console.log(`[Scheduler] 🕐 Creating polls for group ${group.groupId} (timezone: ${timezone}, local time: ${localHours}:${String(localMinutes).padStart(2, '0')})`);

          if (group.topicId) {
            await createDailyPolls(ctx, group.groupId, group.topicId);
            console.log(`[Scheduler] ✅ Created polls for group ${group.groupId}, topic ${group.topicId} (${group.topicName || 'N/A'})`);
          } else {
            await createDailyPolls(ctx, group.groupId);
            console.log(`[Scheduler] ✅ Created polls for group ${group.groupId} (general chat)`);
          }
        }
      } catch (error: any) {
        console.error(`[Scheduler] ❌ Error creating polls for group ${group.groupId}${group.topicId ? `, topic ${group.topicId}` : ''}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error('[Scheduler] ❌ Error in daily polls check:', error);
  }
}

/**
 * Проверяет и отправляет топ для групп, у которых сейчас 00:00 по их часовому поясу
 */
async function executeDailyTopIfNeeded(bot: Telegraf) {
  try {
    const { getGroupsWithTopEnabled } = await import('./topService');
    const groups = await getGroupsWithTopEnabled();
    
    if (groups.length === 0) {
      return;
    }

    const now = new Date();

    for (const group of groups) {
      try {
        // Получаем настройки группы для определения часового пояса
        const settings = await getGroupSettingsComplete(group.groupId);
        if (!settings?.groupSettings) {
          continue;
        }

        const timezone = settings.groupSettings.timezone || 'Europe/Kiev';

        // Получаем текущее время в часовом поясе группы
        const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        const localHours = localTime.getHours();
        const localMinutes = localTime.getMinutes();

        // Проверяем, наступило ли 00:00 по часовому поясу группы
        // Отправляем только в 00:00 (когда localMinutes === 0), чтобы избежать дубликатов
        if (localHours === 0 && localMinutes === 0) {
          // Получаем вчерашнюю дату в часовом поясе группы
          const { getDateStringInTimezone } = await import('../utils/dateHelpers');
          // Получаем текущую дату в часовом поясе группы
          const todayDateStr = getDateStringInTimezone(timezone);
          // Создаем Date объект для вчерашнего дня
          const todayDate = new Date(todayDateStr + 'T00:00:00');
          const yesterdayDate = new Date(todayDate);
          yesterdayDate.setDate(yesterdayDate.getDate() - 1);
          const yesterdayDateStr = getDateStringInTimezone(timezone, yesterdayDate);
          
          // Проверяем, не отправлялся ли уже топ за эту дату (проверяем по логам)
          const { selectQuery } = await import('../db');
          const checkLogQuery = `
            SELECT id FROM bot_logs
            WHERE group_id = ?
              AND action = 'daily_top_sent'
              AND message = ?
            LIMIT 1
          `;
          const existingLog = await selectQuery(checkLogQuery, [group.groupId, yesterdayDateStr], false);
          
          if (existingLog) {
            console.log(`[Scheduler] ⏭️ Top already sent for group ${group.groupId}, date ${yesterdayDateStr}, skipping`);
            continue;
          }
          
          const { sendDailyTop, sendWeeklyTop } = await import('./topService');
          const { executeQuery } = await import('../db');
          
          console.log(`[Scheduler] 🏆 Sending top for group ${group.groupId} (timezone: ${timezone}, local time: ${localHours}:${String(localMinutes).padStart(2, '0')}, date: ${yesterdayDateStr})`);
          
          // Отправляем ежедневный топ
          await sendDailyTop(bot, group.groupId, group.topicId, yesterdayDate);
          
          // Сохраняем информацию об отправке топа в лог
          await executeQuery(
            `INSERT INTO bot_logs (group_id, action, message) VALUES (?, 'daily_top_sent', ?)`,
            [group.groupId, yesterdayDateStr]
          );
          
          console.log(`[Scheduler] ✅ Sent daily top for group ${group.groupId}, topic ${group.topicId} (${group.topicName || 'N/A'})`);
          
          // Проверяем, является ли сегодня понедельник (по часовому поясу группы)
          // В JavaScript getDay() возвращает 0 для воскресенья, 1 для понедельника
          const dayOfWeek = localTime.getDay();
          const isMonday = dayOfWeek === 1;
          
          if (isMonday) {
            // Проверяем, не отправлялся ли уже недельный топ за этот период
            const startDate = new Date(yesterdayDate);
            startDate.setDate(startDate.getDate() - 6); // 7 дней включая вчера
            const startDateStr = getDateStringInTimezone(timezone, startDate);
            const weeklyPeriodStr = `${startDateStr}_${yesterdayDateStr}`;
            
            const checkWeeklyLogQuery = `
              SELECT id FROM bot_logs
              WHERE group_id = ?
                AND action = 'weekly_top_sent'
                AND message = ?
              LIMIT 1
            `;
            const existingWeeklyLog = await selectQuery(checkWeeklyLogQuery, [group.groupId, weeklyPeriodStr], false);
            
            if (!existingWeeklyLog) {
              console.log(`[Scheduler] 📅 Monday detected, sending weekly top for group ${group.groupId} (timezone: ${timezone}, period: ${weeklyPeriodStr})`);
              
              // Отправляем недельный топ
              await sendWeeklyTop(bot, group.groupId, group.topicId, yesterdayDate);
              
              // Сохраняем информацию об отправке недельного топа в лог
              await executeQuery(
                `INSERT INTO bot_logs (group_id, action, message) VALUES (?, 'weekly_top_sent', ?)`,
                [group.groupId, weeklyPeriodStr]
              );
              
              console.log(`[Scheduler] ✅ Sent weekly top for group ${group.groupId}, topic ${group.topicId} (${group.topicName || 'N/A'})`);
            } else {
              console.log(`[Scheduler] ⏭️ Weekly top already sent for group ${group.groupId}, period ${weeklyPeriodStr}, skipping`);
            }
          }
        }
      } catch (error: any) {
        console.error(`[Scheduler] ❌ Error sending top for group ${group.groupId}, topic ${group.topicId}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error('[Scheduler] ❌ Error in daily top check:', error);
  }
}

/**
 * Инициализирует планировщик для созыва групп
 * Проверяет каждую минуту с учетом часового пояса каждой группы
 */
function initGroupCollectionScheduler(bot: Telegraf) {
  // Проверяем каждую минуту, нужно ли отправлять созывы
  // Это позволяет каждой группе работать по своему часовому поясу
  cron.schedule('* * * * *', async () => {
    await executeGroupCollection(bot);
    await executePostponedCollections(bot);
  });

  console.log(`[Scheduler] ✅ Group collection scheduler initialized (checking every minute based on group timezone)`);
}

/**
 * Выполняет созыв групп для всех групп с включенным сбором
 */
async function executeGroupCollection(bot: Telegraf) {
  try {
    const groups = await getGroupsWithCollectionEnabled();
    
    if (groups.length === 0) {
      console.log('[Scheduler] No groups with collection enabled');
      return;
    }

    console.log(`[Scheduler] Found ${groups.length} group/topic(s) with collection enabled`);

    for (const group of groups) {
      try {
        // Получаем настройки группы для проверки интервала
        const settings = await getGroupSettingsComplete(group.groupId);
        if (!settings?.groupSettings) {
          console.warn(`[Scheduler] No settings found for group ${group.groupId}`);
          continue;
        }

        // Используем проверку на undefined, так как 0 - валидное значение
        const intervalHours = settings.groupSettings.collectionIntervalHours !== undefined 
          ? settings.groupSettings.collectionIntervalHours 
          : 2;
        const intervalMinutes = settings.groupSettings.collectionIntervalMinutes !== undefined 
          ? settings.groupSettings.collectionIntervalMinutes 
          : 0;
        
        console.log(`[Scheduler] Checking group ${group.groupId}, topic ${group.topicId}: interval=${intervalHours}h ${intervalMinutes}m`);
        
        // Вычисляем интервал в миллисекундах
        const intervalMs = (intervalHours * 60 + intervalMinutes) * 60 * 1000;
        
        // Если интервал равен 0, пропускаем (не настроен)
        if (intervalMs === 0) {
          console.log(`[Scheduler] Skipping group ${group.groupId}, topic ${group.topicId} - interval is 0 (not configured)`);
          continue;
        }
        
        // Получаем часовой пояс группы
        const groupTimezone = settings.groupSettings.timezone || 'Europe/Kiev';
        
        // Вычисляем ожидаемое время с учетом начала дня 00:00 по часовому поясу группы
        const { calculateNextScheduledTime } = await import('../utils/timeHelpers');
        const expectedScheduledTime = calculateNextScheduledTime(intervalHours, intervalMinutes, groupTimezone);
        const now = new Date();
        
        // Проверяем, не было ли уже отправлено сообщение для этого интервала
        // Проверяем оба типа битв (clan_battles и demon_battles) - берем больше записей для проверки
        const { selectQuery } = await import('../db');
        const lastCallQuery = `
          SELECT status, scheduled_time, battle_type
          FROM group_collection_calls
          WHERE group_id = ? AND topic_id = ?
          ORDER BY id DESC
          LIMIT 10
        `;
        const lastCalls = await selectQuery(lastCallQuery, [group.groupId, group.topicId]);
        
        // Проверяем, наступило ли время для отправки
        // Ожидаемое время отправки для текущего интервала
        const timeSinceExpected = now.getTime() - expectedScheduledTime.getTime();
        
        console.log(`[Scheduler] Group ${group.groupId}, topic ${group.topicId}: now=${now.toISOString()}, expected=${expectedScheduledTime.toISOString()}, diff=${Math.round(timeSinceExpected / 1000)}s`);
        
        // Проверяем, не было ли уже отправлено сообщение для этого интервала
        // Проверяем, что уже созданы ОБА сообщения (clan_battles И demon_battles) для этого интервала
        if (lastCalls && lastCalls.length > 0) {
          const tolerance = 60 * 1000; // 1 минута
          
          // Проверяем, что есть оба типа битв (clan_battles и demon_battles) в пределах tolerance
          const activeCalls = lastCalls.filter((call: any) => {
            const callTime = new Date(call.scheduledTime);
            const timeDiff = Math.abs(callTime.getTime() - expectedScheduledTime.getTime());
            return call.status !== 'cancelled' && timeDiff < tolerance;
          });
          
          const hasClanBattles = activeCalls.some((call: any) => call.battleType === 'clan_battles');
          const hasDemonBattles = activeCalls.some((call: any) => call.battleType === 'demon_battles');
          
          // Если уже созданы оба сообщения для этого интервала - пропускаем
          if (hasClanBattles && hasDemonBattles) {
            console.log(`[Scheduler] Skipping group ${group.groupId}, topic ${group.topicId} - already sent both collection messages for this interval (clan_battles and demon_battles)`);
            continue;
          }
          
          // Проверяем, не был ли последний созыв отменен недавно
          const recentCancelledCall = lastCalls.find((call: any) => {
            const cancelledTime = new Date(call.scheduledTime);
            const timeSinceCancelled = now.getTime() - cancelledTime.getTime();
            return call.status === 'cancelled' && timeSinceCancelled < intervalMs;
          });
          
          if (recentCancelledCall) {
            console.log(`[Scheduler] Skipping group ${group.groupId}, topic ${group.topicId} - was cancelled recently, waiting for next interval`);
            continue;
          }
        }
        
        // Отправляем ТОЛЬКО если мы в пределах 30 секунд до или после ожидаемого времени
        // Это позволяет учесть небольшие задержки и неточности, но предотвращает спам
        const timeWindow = 30 * 1000; // 30 секунд
        if (Math.abs(timeSinceExpected) > timeWindow) {
          // Если еще рано (больше чем на 30 секунд в будущем), пропускаем
          if (timeSinceExpected < 0) {
            console.log(`[Scheduler] Skipping group ${group.groupId}, topic ${group.topicId} - too early (${Math.round(-timeSinceExpected / 1000)}s early), expected at ${expectedScheduledTime.toISOString()}`);
            continue;
          }
          // Если прошло больше 30 секунд после ожидаемого времени - пропустили этот интервал, ждем следующего
          console.log(`[Scheduler] Skipping group ${group.groupId}, topic ${group.topicId} - missed time window (${Math.round(timeSinceExpected / 1000)}s late, waiting for next interval)`);
          continue;
        }

        // Создаем контекст для отправки сообщений
        const ctx = {
          telegram: bot.telegram,
        } as any;

        console.log(`[Scheduler] 🚀 Sending collection messages for group ${group.groupId}, topic ${group.topicId} (${group.topicName || 'N/A'})`);
        await createCollectionMessages(ctx, group.groupId, group.topicId);
        console.log(`[Scheduler] ✅ Created collection messages for group ${group.groupId}, topic ${group.topicId} (${group.topicName || 'N/A'})`);
      } catch (error: any) {
        console.error(`[Scheduler] ❌ Error creating collection messages for group ${group.groupId}${group.topicId ? `, topic ${group.topicId}` : ''}:`, error.message);
      }
    }

    console.log('[Scheduler] ✅ Group collection task completed');
  } catch (error: any) {
    console.error('[Scheduler] ❌ Error in group collection task:', error);
  }
}

/**
 * Выполняет отложенные созывы (переносы на 10 минут)
 */
async function executePostponedCollections(bot: Telegraf) {
  try {
    const { selectQuery } = await import('../db');
    const now = new Date();
    
    // Находим все отложенные созывы, время которых наступило
    const query = `
      SELECT 
        group_id,
        topic_id,
        battle_type
      FROM group_collection_calls
      WHERE status = 'postponed'
        AND postponed_until <= ?
      ORDER BY postponed_until ASC
    `;
    
    const postponedCalls = await selectQuery(query, [now]);
    
    if (postponedCalls.length === 0) {
      return;
    }
    
    console.log(`[Scheduler] Found ${postponedCalls.length} postponed collection call(s) to execute`);
    
    for (const call of postponedCalls) {
      try {
        const ctx = {
          telegram: bot.telegram,
        } as any;
        
        // Отправляем сообщение снова
        const { createClanBattlesCollectionMessage, createDemonBattlesCollectionMessage } = await import('./groupCollectionService');
        
        if (call.battleType === 'clan_battles') {
          await createClanBattlesCollectionMessage(ctx, call.groupId, call.topicId);
        } else {
          await createDemonBattlesCollectionMessage(ctx, call.groupId, call.topicId);
        }
        
        // Обновляем статус на pending
        const { executeQuery } = await import('../db');
        await executeQuery(
          `UPDATE group_collection_calls SET status = 'pending', postponed_until = NULL WHERE group_id = ? AND topic_id = ? AND battle_type = ? AND status = 'postponed' ORDER BY id DESC LIMIT 1`,
          [call.groupId, call.topicId, call.battleType]
        );
        
        console.log(`[Scheduler] ✅ Executed postponed collection for group ${call.groupId}, topic ${call.topicId}, type ${call.battleType}`);
      } catch (error: any) {
        console.error(`[Scheduler] ❌ Error executing postponed collection:`, error);
      }
    }
  } catch (error: any) {
    console.error('[Scheduler] ❌ Error in postponed collections task:', error);
  }
}

