import { Context } from 'telegraf';
import { config } from '../config/env';
import { checkBotPermissions, isGroupWithTopics } from '../utils/permissions';
import { upsertGroupMember } from '../services/groupMembersService';
import { createRegistrationMessage } from '../services/registrationService';

/**
 * Обработчик добавления бота в группу
 * - Если группа не в whitelist: отправляет сообщение и покидает чат
 * - Если группа в whitelist: проверяет права администратора и отправляет соответствующее сообщение
 */
export async function handleGroupJoin(ctx: Context) {
  // Проверяем, что это событие изменения статуса бота
  if (!ctx.myChatMember || !ctx.chat) {
    return;
  }

  const chat = ctx.chat;
  const newStatus = ctx.myChatMember.new_chat_member.status;
  const oldStatus = ctx.myChatMember.old_chat_member?.status;

  // Обрабатываем только группы и супергруппы
  if (chat.type !== 'group' && chat.type !== 'supergroup') {
    return;
  }

  const chatId = chat.id;
  const allowedGroups = config.allowedGroupIds;

  // Если список разрешенных групп пуст, разрешаем все (для разработки)
  if (allowedGroups.length === 0) {
    console.warn(`[GroupJoin] No allowed groups configured. Bot will stay in group ${chatId}`);
    return;
  }

  // Проверяем, есть ли группа в whitelist
  if (!allowedGroups.includes(chatId)) {
    // Группа не разрешена - проверяем, что бот был добавлен
    const wasAdded = 
      (oldStatus === 'left' || oldStatus === 'kicked') &&
      (newStatus === 'member' || newStatus === 'administrator');

    if (!wasAdded) {
      return;
    }

    console.warn(`[GroupJoin] Bot added to unauthorized group ${chatId}. Leaving...`);

    try {
      // Отправляем сообщение
      await ctx.reply(
        'Хмм… это точно не AniCard Gods. Вы, ребята, конечно, милые, но я обслуживаю только легенд. Чао!'
      );

      // Небольшая задержка перед выходом, чтобы сообщение успело отправиться
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Покидаем чат
      await ctx.telegram.leaveChat(chatId);
      console.log(`[GroupJoin] Bot left unauthorized group ${chatId}`);
    } catch (error: any) {
      console.error(`[GroupJoin] Error handling unauthorized group ${chatId}:`, error);
      
      // Если не удалось отправить сообщение или покинуть чат, пробуем еще раз покинуть
      try {
        await ctx.telegram.leaveChat(chatId);
      } catch (leaveError) {
        console.error(`[GroupJoin] Failed to leave chat ${chatId}:`, leaveError);
      }
    }
    return;
  }

  // Группа разрешена - обрабатываем добавление или повышение
  const wasAdded = 
    (oldStatus === 'left' || oldStatus === 'kicked') &&
    (newStatus === 'member' || newStatus === 'administrator');

  const wasPromoted = 
    oldStatus === 'member' && newStatus === 'administrator';

  // Обрабатываем только добавление или повышение
  if (!wasAdded && !wasPromoted) {
    return;
  }

  try {
    // При добавлении бота в группу, сохраняем информацию о пользователе, который добавил
    if (ctx.from) {
      await upsertGroupMember(
        chatId,
        ctx.from.id,
        ctx.from.first_name,
        ctx.from.last_name,
        ctx.from.username,
        'member'
      );
    }

    if (newStatus === 'administrator') {
      // Бот добавлен с правами администратора или получил повышение
      const isTopicsGroup = isGroupWithTopics(chat);
      const permissions = await checkBotPermissions(ctx);
      
      let message = 'Администраторские права получены. Готов приступить к проверке активности, контролю клановых боёв и выполнению служебных задач для AniCard Gods.';
      
      if (isTopicsGroup) {
        if (permissions.hasRequiredPermissions) {
          message += '\n\n✅ Все необходимые права для работы с темами получены.';
        } else {
          message += '\n\n⚠️ Для полноценной работы в группе с темами необходимы дополнительные права:';
          permissions.missingPermissions.forEach(perm => {
            message += `\n• ${perm}`;
          });
          message += '\n\nИспользуйте команду /settings для проверки прав.';
        }
      }
      
      message += '\n\nДля настройки бота используйте команду /settings';
      
      await ctx.reply(message);
      
      // Создаем и закрепляем сообщение с кнопкой регистрации
      try {
        await createRegistrationMessage(ctx, chatId);
      } catch (regError: any) {
        console.error(`[GroupJoin] Error creating registration message:`, regError);
        // Не критично, продолжаем
      }
      
      console.log(`[GroupJoin] Bot added/promoted as admin in authorized group ${chatId}`);
    } else if (newStatus === 'member') {
      // Бот добавлен без прав администратора
      await ctx.reply(
        'AniCard Gods, я готов следить за активностью, боями и порядком. Но без админки максимум, что я могу — морально поддерживать. А оно вам надо?'
      );
      console.log(`[GroupJoin] Bot added without admin rights in authorized group ${chatId}`);
    }
  } catch (error: any) {
    console.error(`[GroupJoin] Error sending welcome message in group ${chatId}:`, error);
  }
}

