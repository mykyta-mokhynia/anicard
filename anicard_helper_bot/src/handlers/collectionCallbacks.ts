import { Context } from 'telegraf';
import { updateCollectionCallStatus, postponeCollectionCall } from '../services/groupCollectionService';

/**
 * Обработчики callback для созыва групп
 */
export async function handleCollectionCallback(ctx: Context) {
  if (!('data' in ctx.callbackQuery!)) {
    return;
  }

  const data = ctx.callbackQuery.data as string;
  const parts = data.split(':');

  if (parts.length < 4) {
    return;
  }

  if (!ctx.chat || !('id' in ctx.chat)) {
    await ctx.answerCbQuery('❌ Ошибка: группа не найдена');
    return;
  }

  const groupId = ctx.chat.id;
  const topicId = parseInt(parts[2], 10);
  const battleType = parts[3] as 'clan_battles' | 'demon_battles';

  if (isNaN(topicId) || (battleType !== 'clan_battles' && battleType !== 'demon_battles')) {
    await ctx.answerCbQuery('❌ Ошибка: некорректные параметры');
    return;
  }

  try {
    await ctx.answerCbQuery(); // Подтверждаем нажатие кнопки

    switch (parts[1]) {
      case 'collect':
        await handleCollectAction(ctx, groupId, topicId, battleType);
        break;
      case 'postpone':
        await handlePostponeAction(ctx, groupId, topicId, battleType);
        break;
      case 'cancel':
        await handleCancelAction(ctx, groupId, topicId, battleType);
        break;
      default:
        console.warn(`[CollectionCallback] Unknown action: ${parts[1]}`);
    }
  } catch (error: any) {
    console.error(`[CollectionCallback] Error handling ${data}:`, error);
    try {
      await ctx.answerCbQuery('❌ Произошла ошибка');
    } catch (cbError) {
      // Игнорируем ошибки ответа на callback
    }
  }
}

/**
 * Обработчик кнопки "Собрать"
 */
async function handleCollectAction(
  ctx: Context,
  groupId: number,
  topicId: number,
  battleType: 'clan_battles' | 'demon_battles'
) {
  await updateCollectionCallStatus(groupId, topicId, battleType, 'collected');
  
  // Получаем список неотметившихся пользователей для отметки
  const { getUsersNotAnswered } = await import('../services/groupCollectionService');
  const notAnswered = await getUsersNotAnswered(ctx, groupId, topicId, battleType);
  
  // Обновляем сообщение, убирая кнопки
  try {
    if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      const message = ctx.callbackQuery.message as any;
      const battleName = battleType === 'clan_battles' ? 'клановую битву' : 'демонические сражения';
      await ctx.telegram.editMessageText(
        groupId,
        message.message_id,
        undefined,
        `✅ <b>Группа собрана на ${battleName}</b>`,
        {
          parse_mode: 'HTML',
        }
      );
    }
  } catch (error: any) {
    console.error('[CollectionCallback] Error updating message:', error);
  }

  // Отправляем сообщение с упоминаниями пользователей
  if (notAnswered.length > 0) {
    try {
      const battleName = battleType === 'clan_battles' ? 'клановую битву' : 'демонические сражения';
      
      // Формируем список упоминаний
      const mentions = notAnswered.map(user => {
        if (user.username) {
          return `@${user.username}`;
        } else {
          // Используем HTML для упоминания по user_id
          const name = user.firstName || 'Пользователь';
          return `<a href="tg://user?id=${user.userId}">${name}</a>`;
        }
      }).join(' ');

      const mentionMessage = `⚔️ <b>Сбор на ${battleName}</b>\n\n${mentions}`;

      const messageOptions: any = {
        parse_mode: 'HTML',
      };

      // Если topicId = 1, это общий чат, не передаем message_thread_id
      if (topicId !== 1) {
        messageOptions.message_thread_id = topicId;
      }

      await ctx.telegram.sendMessage(groupId, mentionMessage, messageOptions);
      console.log(`[CollectionCallback] ✅ Sent mentions for ${notAnswered.length} users`);
    } catch (error: any) {
      console.error('[CollectionCallback] Error sending mentions:', error);
    }
  }

  await ctx.answerCbQuery('✅ Группа собрана!');
}

/**
 * Обработчик кнопки "Перенос на 10 минут"
 */
async function handlePostponeAction(
  ctx: Context,
  groupId: number,
  topicId: number,
  battleType: 'clan_battles' | 'demon_battles'
) {
  const postponedUntil = await postponeCollectionCall(groupId, topicId, battleType);
  
  // Обновляем сообщение
  try {
    if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      const message = ctx.callbackQuery.message as any;
      const battleName = battleType === 'clan_battles' ? 'клановую битву' : 'демонические сражения';
      
      await ctx.telegram.editMessageText(
        groupId,
        message.message_id,
        undefined,
        `⏰ <b>Созыв на ${battleName} перенесен на 10 минут</b>\n\n` +
        `Новое время: ${postponedUntil.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
        {
          parse_mode: 'HTML',
        }
      );
    }
  } catch (error: any) {
    console.error('[CollectionCallback] Error updating message:', error);
  }

  await ctx.answerCbQuery('⏰ Перенесено на 10 минут');
}

/**
 * Обработчик кнопки "Отменить"
 */
async function handleCancelAction(
  ctx: Context,
  groupId: number,
  topicId: number,
  battleType: 'clan_battles' | 'demon_battles'
) {
  await updateCollectionCallStatus(groupId, topicId, battleType, 'cancelled');
  
  // Обновляем сообщение
  try {
    if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      const message = ctx.callbackQuery.message as any;
      const battleName = battleType === 'clan_battles' ? 'клановую битву' : 'демонические сражения';
      
      await ctx.telegram.editMessageText(
        groupId,
        message.message_id,
        undefined,
        `❌ <b>Созыв на ${battleName} отменен</b>\n\n` +
        `Следующий созыв будет через установленный интервал.`,
        {
          parse_mode: 'HTML',
        }
      );
    }
  } catch (error: any) {
    console.error('[CollectionCallback] Error updating message:', error);
  }

  await ctx.answerCbQuery('❌ Созыв отменен');
}

