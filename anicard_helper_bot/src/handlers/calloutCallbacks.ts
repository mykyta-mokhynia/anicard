import { Context, Telegraf } from 'telegraf';
import { handleGoingButton, handleCallReadyButton } from '../services/calloutService';

/**
 * Обработчики callback для созывов
 */
export async function handleCalloutCallback(bot: Telegraf, ctx: Context) {
  if (!('data' in ctx.callbackQuery!)) {
    return;
  }

  const data = ctx.callbackQuery.data as string;
  const parts = data.split(':');

  if (parts[0] !== 'callout') {
    return;
  }

  // Проверяем, что callback из группы (не из личных сообщений)
  if (!ctx.chat || ctx.chat.type === 'private') {
    await ctx.answerCbQuery('❌ Эта функция доступна только в группах.');
    return;
  }

  // Проверяем, что это группа или супергруппа
  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
    await ctx.answerCbQuery('❌ Эта функция доступна только в группах.');
    return;
  }

  if (parts.length < 3) {
    return;
  }

  const action = parts[1];
  const calloutId = parseInt(parts[2], 10);

  if (isNaN(calloutId)) {
    await ctx.answerCbQuery('❌ Ошибка: некорректный ID созыва');
    return;
  }

  try {
    switch (action) {
      case 'going':
        await handleGoingButton(ctx, calloutId);
        break;
      case 'call':
        await handleCallReadyButton(bot, ctx, calloutId);
        break;
      default:
        console.warn(`[CalloutCallback] Unknown action: ${action}`);
    }
  } catch (error: any) {
    console.error(`[CalloutCallback] Error handling ${data}:`, error);
    try {
      await ctx.answerCbQuery('❌ Произошла ошибка');
    } catch (cbError) {
      // Игнорируем ошибки ответа на callback
    }
  }
}

