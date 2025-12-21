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

  if (!ctx.from) {
    await ctx.answerCbQuery('❌ Ошибка: не удалось определить пользователя.');
    return;
  }

  // Проверяем, что callback НЕ из личных сообщений
  // В личных сообщениях ctx.chat.type === 'private'
  if (!ctx.chat || ctx.chat.type === 'private') {
    await ctx.answerCbQuery('❌ Регистрация доступна только в группах. Используйте команду /register в группе.');
    return;
  }

  // Проверяем, что это группа или супергруппа
  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
    await ctx.answerCbQuery('❌ Эта функция доступна только в группах.');
    return;
  }

  const groupId = parseInt(parts[2], 10);
  const actualUserId = ctx.from.id;

  // Если в callback есть userId (новый формат: registration:register:groupId:userId)
  // Проверяем, что кнопку нажал тот же пользователь, который вызвал команду /register
  if (parts.length >= 4) {
    const expectedUserId = parseInt(parts[3], 10);
    if (actualUserId !== expectedUserId) {
      await ctx.answerCbQuery('❌ Эта кнопка предназначена для другого пользователя. Используйте команду /register для создания своей кнопки регистрации.');
      return;
    }
  }
  // Если userId нет в callback (старый формат для общих сообщений регистрации)
  // Разрешаем регистрацию любому пользователю из группы

  // Дополнительная проверка: ID группы должен быть отрицательным
  // Группы в Telegram имеют отрицательные ID, личные чаты - положительные
  if (groupId > 0) {
    await ctx.answerCbQuery('❌ Ошибка: некорректный ID группы. Регистрация доступна только в группах.');
    return;
  }

  // Проверяем, что callback вызван в правильной группе
  if (ctx.chat.id !== groupId) {
    await ctx.answerCbQuery('❌ Эта кнопка предназначена для другой группы');
    return;
  }

  try {
    // ВАЖНО: Используем actualUserId (ctx.from.id), а не userId из callback_data, для безопасности
    // Это гарантирует, что регистрируется тот, кто нажал кнопку, а не тот, чей ID в callback
    const registered = await handleUserRegistration(ctx, groupId, actualUserId);

    if (registered) {
      // Пользователь успешно зарегистрирован
      await ctx.answerCbQuery('✅ Вы успешно зарегистрированы!', { show_alert: true });
      
      // Удаляем сообщение с кнопкой регистрации
      try {
        if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
          const message = ctx.callbackQuery.message as any;
          await ctx.telegram.deleteMessage(groupId, message.message_id);
          console.log(`[RegistrationCallback] ✅ Deleted registration message for user ${actualUserId}`);
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

