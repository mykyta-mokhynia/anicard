import { Context } from 'telegraf';
import { handleUserRegistration } from '../services/registrationService';

/**
 * Обработчик callback для регистрации пользователей
 */
export async function handleRegistrationCallback(ctx: Context) {
  if (!('data' in ctx.callbackQuery!)) {
    return;
  }

  const data = ctx.callbackQuery.data as string;
  const parts = data.split(':');

  if (parts[0] !== 'registration' || parts[1] !== 'register') {
    return;
  }

  if (!ctx.chat || !('id' in ctx.chat) || !ctx.from) {
    await ctx.answerCbQuery('❌ Ошибка: не удалось определить группу или пользователя');
    return;
  }

  const groupId = parseInt(parts[2], 10);
  const userId = ctx.from.id;

  // Проверяем, что callback вызван в правильной группе
  if (ctx.chat.id !== groupId) {
    await ctx.answerCbQuery('❌ Эта кнопка предназначена для другой группы');
    return;
  }

  try {
    const registered = await handleUserRegistration(ctx, groupId, userId);

    if (registered) {
      // Пользователь успешно зарегистрирован
      await ctx.answerCbQuery('✅ Вы успешно зарегистрированы!', { show_alert: true });
      
      // Удаляем сообщение с кнопкой регистрации
      try {
        if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
          const message = ctx.callbackQuery.message as any;
          await ctx.telegram.deleteMessage(groupId, message.message_id);
          console.log(`[RegistrationCallback] ✅ Deleted registration message for user ${userId}`);
        }
      } catch (deleteError: any) {
        // Не критично, если не удалось удалить сообщение
        console.warn('[RegistrationCallback] Could not delete message:', deleteError.message);
      }
    } else {
      // Пользователь уже был зарегистрирован
      await ctx.answerCbQuery('ℹ️ Вы уже зарегистрированы!', { show_alert: true });
    }
  } catch (error: any) {
    console.error('[RegistrationCallback] Error:', error);
    try {
      await ctx.answerCbQuery('❌ Произошла ошибка при регистрации');
    } catch (cbError) {
      // Игнорируем ошибки ответа на callback
    }
  }
}

