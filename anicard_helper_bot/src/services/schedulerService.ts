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
  // Запускаем опросники каждый день в 17:00 по времени сервера
  // Формат cron: секунда минута час день месяц день_недели
  // 0 0 17 * * * = каждый день в 17:00:00
  // Используем timezone из переменной окружения или по умолчанию Europe/Kiev
  const timezone = process.env.TIMEZONE || 'Europe/Kiev';
  
  cron.schedule('0 0 17 * * *', async () => {
    console.log(`[Scheduler] 🕐 Daily polls task triggered at 17:00 (timezone: ${timezone})`);
    
    try {
      const groups = await getGroupsWithPollsEnabled();
      
      if (groups.length === 0) {
        console.log('[Scheduler] No groups with polls enabled');
        return;
      }

      console.log(`[Scheduler] Found ${groups.length} group/topic(s) with polls enabled`);

      for (const group of groups) {
        try {
          // Создаем контекст для отправки опросников
          const ctx = {
            telegram: bot.telegram,
          } as any;

          if (group.topicId) {
            // Отправляем в конкретную тему
            await createDailyPolls(ctx, group.groupId, group.topicId);
            console.log(`[Scheduler] ✅ Created polls for group ${group.groupId}, topic ${group.topicId} (${group.topicName || 'N/A'})`);
          } else {
            // Отправляем в общий чат (если темы не используются)
            await createDailyPolls(ctx, group.groupId);
            console.log(`[Scheduler] ✅ Created polls for group ${group.groupId} (general chat)`);
          }
        } catch (error: any) {
          console.error(`[Scheduler] ❌ Error creating polls for group ${group.groupId}${group.topicId ? `, topic ${group.topicId}` : ''}:`, error.message);
        }
      }

      console.log('[Scheduler] ✅ Daily polls task completed');
    } catch (error: any) {
      console.error('[Scheduler] ❌ Error in daily polls task:', error);
    }
  }, {
    timezone,
  });

  // Очистка старых данных опросников (каждый день в 03:00)
  cron.schedule('0 0 3 * * *', async () => {
    console.log('[Scheduler] 🧹 Cleaning up old poll data (older than 60 days)');
    try {
      await cleanupOldPollData();
      console.log('[Scheduler] ✅ Old poll data cleanup completed');
    } catch (error: any) {
      console.error('[Scheduler] ❌ Error cleaning up old poll data:', error);
    }
  }, {
    timezone,
  });

  // Планировщик для созыва групп (начиная с 17:00, затем по интервалу)
  initGroupCollectionScheduler(bot, timezone);

  console.log(`[Scheduler] ✅ Daily polls scheduler initialized (17:00 daily, cleanup at 03:00, timezone: ${timezone})`);
}

/**
 * Инициализирует планировщик для созыва групп
 * Запускается в 17:00, затем по интервалу из настроек группы
 */
function initGroupCollectionScheduler(bot: Telegraf, timezone: string) {
  // Запускаем первый созыв в 17:00
  cron.schedule('0 0 17 * * *', async () => {
    console.log(`[Scheduler] 🕐 Group collection task triggered at 17:00 (timezone: ${timezone})`);
    await executeGroupCollection(bot);
  }, {
    timezone,
  });

  // Проверяем каждую минуту, нужно ли отправлять созывы (для переносов и интервалов)
  // Это позволяет поддерживать интервалы от 1 минуты
  cron.schedule('* * * * *', async () => {
    const checkTime = new Date();
    console.log(`[Scheduler] ⏰ Minute check triggered at ${checkTime.toISOString()}`);
    await executeGroupCollection(bot);
    await executePostponedCollections(bot);
  }, {
    timezone,
  });

  console.log(`[Scheduler] ✅ Group collection scheduler initialized (starting at 17:00, checking every minute, timezone: ${timezone})`);
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
        
        // Проверяем, нужно ли отправлять сейчас (начиная с 17:00)
        const now = new Date();
        const startTime = new Date();
        startTime.setHours(17, 0, 0, 0); // 17:00
        
        // Если текущее время до 17:00, пропускаем (еще не начался день)
        if (now.getTime() < startTime.getTime()) {
          continue;
        }
        
        // Вычисляем интервал в миллисекундах
        const intervalMs = (intervalHours * 60 + intervalMinutes) * 60 * 1000;
        
        // Если интервал равен 0, пропускаем (не настроен)
        if (intervalMs === 0) {
          console.log(`[Scheduler] Skipping group ${group.groupId}, topic ${group.topicId} - interval is 0 (not configured)`);
          continue;
        }
        
        // Вычисляем, сколько времени прошло с 17:00
        const timeSinceStart = now.getTime() - startTime.getTime();
        
        // Проверяем, прошло ли нужное количество интервалов
        const intervalsPassed = Math.floor(timeSinceStart / intervalMs);
        const expectedScheduledTime = new Date(startTime.getTime() + intervalsPassed * intervalMs);
        
        // Проверяем, не было ли уже отправлено сообщение для этого интервала
        const { selectQuery } = await import('../db');
        const lastCallQuery = `
          SELECT status, scheduled_time, battle_type
          FROM group_collection_calls
          WHERE group_id = ? AND topic_id = ?
          ORDER BY id DESC
          LIMIT 1
        `;
        const lastCall = await selectQuery(lastCallQuery, [group.groupId, group.topicId], false);
        
        // Проверяем, не был ли последний созыв отменен
        if (lastCall && lastCall.status === 'cancelled') {
          // Если был отменен, проверяем, прошло ли достаточно времени с момента отмены
          const cancelledTime = new Date(lastCall.scheduledTime);
          const timeSinceCancelled = now.getTime() - cancelledTime.getTime();
          
          if (timeSinceCancelled < intervalMs) {
            console.log(`[Scheduler] Skipping group ${group.groupId}, topic ${group.topicId} - was cancelled, waiting for interval`);
            continue;
          }
        }
        
        // Если уже было отправлено сообщение для этого интервала, пропускаем
        if (lastCall && lastCall.status !== 'cancelled') {
          const lastCallTime = new Date(lastCall.scheduledTime);
          // Проверяем, был ли последний вызов в пределах текущего интервала
          // Для интервалов меньше 5 минут используем погрешность 30 секунд, иначе половину интервала
          const tolerance = intervalMs < 5 * 60 * 1000 
            ? 30 * 1000  // Для интервалов < 5 минут: 30 секунд
            : Math.min(intervalMs / 2, 60 * 1000); // Для больших интервалов: половина интервала или 1 минута
          const timeDiff = Math.abs(lastCallTime.getTime() - expectedScheduledTime.getTime());
          if (timeDiff < tolerance) {
            console.log(`[Scheduler] Skipping group ${group.groupId}, topic ${group.topicId} - already sent for this interval at ${lastCallTime.toISOString()} (diff=${Math.round(timeDiff / 1000)}s, tolerance=${Math.round(tolerance / 1000)}s)`);
            continue;
          }
        }
        
        // Проверяем, наступило ли время для отправки
        // Ожидаемое время отправки для текущего интервала
        const timeSinceExpected = now.getTime() - expectedScheduledTime.getTime();
        
        console.log(`[Scheduler] Group ${group.groupId}, topic ${group.topicId}: now=${now.toISOString()}, expected=${expectedScheduledTime.toISOString()}, diff=${Math.round(timeSinceExpected / 1000)}s`);
        
        // Отправляем только если мы в пределах 30 секунд до или после ожидаемого времени
        // Это позволяет учесть небольшие задержки и неточности
        if (Math.abs(timeSinceExpected) > 30 * 1000) {
          // Если еще рано (больше чем на 30 секунд в будущем), пропускаем
          if (timeSinceExpected < 0) {
            console.log(`[Scheduler] Skipping group ${group.groupId}, topic ${group.topicId} - too early (${Math.round(-timeSinceExpected / 1000)}s early), expected at ${expectedScheduledTime.toISOString()}`);
            continue;
          }
          // Если прошло больше 30 секунд, но меньше интервала - это нормальная задержка, отправляем
          // Если прошло больше интервала - пропустили, ждем следующего
          if (timeSinceExpected >= intervalMs) {
            console.log(`[Scheduler] Skipping group ${group.groupId}, topic ${group.topicId} - missed interval (${Math.round(timeSinceExpected / 1000)}s late, interval=${Math.round(intervalMs / 1000)}s), waiting for next`);
            continue;
          }
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

