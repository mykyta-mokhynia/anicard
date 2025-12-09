import { Context } from 'telegraf';
import { config } from '../config/env';
import { upsertGroupMember, removeGroupMember } from '../services/groupMembersService';
import { sendWelcomeMessageToUser } from '../services/registrationService';

/**
 * Обработчик изменений участников группы (вход/выход)
 */
export async function handleChatMemberUpdate(ctx: Context) {
  // Проверяем, что это событие изменения участника
  if (!ctx.chatMember || !ctx.chat) {
    return;
  }

  const chat = ctx.chat;
  const chatId = chat.id;

  // Обрабатываем только группы и супергруппы
  if (chat.type !== 'group' && chat.type !== 'supergroup') {
    return;
  }

  // Проверяем, что группа в whitelist
  const allowedGroups = config.allowedGroupIds;
  if (allowedGroups.length > 0 && !allowedGroups.includes(chatId)) {
    return;
  }

  const newMember = ctx.chatMember.new_chat_member;
  const oldMember = ctx.chatMember.old_chat_member;
  const user = ctx.chatMember.from;

  if (!user) {
    return;
  }

  const userId = user.id;
  const newStatus = newMember.status;
  const oldStatus = oldMember?.status;

  // Определяем, что произошло
  const wasAdded = (oldStatus === 'left' || oldStatus === 'kicked') &&
                   (newStatus === 'member' || newStatus === 'administrator' || newStatus === 'creator');
  
  const wasRemoved = (oldStatus === 'member' || oldStatus === 'administrator' || oldStatus === 'creator' || oldStatus === 'restricted') &&
                     (newStatus === 'left' || newStatus === 'kicked');

  try {
    if (wasAdded) {
      // Пользователь присоединился к группе
      await upsertGroupMember(
        chatId,
        userId,
        user.first_name,
        user.last_name,
        user.username,
        'member'
      );
      
      // Отправляем приветственное сообщение новому пользователю
      try {
        await sendWelcomeMessageToUser(
          ctx,
          chatId,
          userId,
          user.first_name,
          user.username
        );
      } catch (welcomeError: any) {
        console.error(`[ChatMember] Error sending welcome message:`, welcomeError);
        // Не критично, продолжаем
      }
      
      console.log(`[ChatMember] ✅ User ${userId} joined group ${chatId}`);
    } else if (wasRemoved) {
      // Пользователь покинул группу
      await removeGroupMember(chatId, userId);
      console.log(`[ChatMember] ✅ User ${userId} left group ${chatId}`);
    } else if (newStatus === 'member' || newStatus === 'administrator' || newStatus === 'creator' || newStatus === 'restricted') {
      // Обновляем информацию о пользователе (например, изменился username)
      await upsertGroupMember(
        chatId,
        userId,
        user.first_name,
        user.last_name,
        user.username,
        'member'
      );
    }
  } catch (error: any) {
    console.error(`[ChatMember] ❌ Error handling member update for user ${userId} in group ${chatId}:`, error);
  }
}

