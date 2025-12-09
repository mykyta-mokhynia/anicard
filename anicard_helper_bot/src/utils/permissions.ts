import { Context } from 'telegraf';

/**
 * Проверяет, является ли группа группой с темами (topics)
 */
export function isGroupWithTopics(chat: any): boolean {
  return chat.type === 'supergroup' && chat.is_forum === true;
}

/**
 * Проверяет права бота в группе
 * Для групп с темами требуются дополнительные права
 */
export async function checkBotPermissions(ctx: Context): Promise<{
  isAdmin: boolean;
  hasRequiredPermissions: boolean;
  missingPermissions: string[];
  isGroupWithTopics: boolean;
}> {
  if (!ctx.chat || !('id' in ctx.chat)) {
    return {
      isAdmin: false,
      hasRequiredPermissions: false,
      missingPermissions: [],
      isGroupWithTopics: false,
    };
  }

  const chat = ctx.chat;
  const chatId = chat.id;
  const isTopicsGroup = isGroupWithTopics(chat);

  try {
    // Получаем информацию о боте
    const me = await ctx.telegram.getMe();
    const botInfo = await ctx.telegram.getChatMember(chatId, me.id);
    
    if (botInfo.status !== 'administrator' && botInfo.status !== 'creator') {
      return {
        isAdmin: false,
        hasRequiredPermissions: false,
        missingPermissions: ['Администраторские права'],
        isGroupWithTopics: isTopicsGroup,
      };
    }

    // Если это не группа с темами, достаточно быть администратором
    if (!isTopicsGroup) {
      return {
        isAdmin: true,
        hasRequiredPermissions: true,
        missingPermissions: [],
        isGroupWithTopics: false,
      };
    }

    // Для групп с темами проверяем необходимые права
    const requiredPermissions = [
      'can_manage_topics',
      'can_change_info',
      'can_delete_messages',
    ];

    const missingPermissions: string[] = [];

    if (botInfo.status === 'creator') {
      // Создатель имеет все права
      return {
        isAdmin: true,
        hasRequiredPermissions: true,
        missingPermissions: [],
        isGroupWithTopics: true,
      };
    }

    // Проверяем права администратора
    if ('can_manage_topics' in botInfo && !botInfo.can_manage_topics) {
      missingPermissions.push('Управление темами (can_manage_topics)');
    }

    if ('can_change_info' in botInfo && !botInfo.can_change_info) {
      missingPermissions.push('Изменение информации группы (can_change_info)');
    }

    if ('can_delete_messages' in botInfo && !botInfo.can_delete_messages) {
      missingPermissions.push('Удаление сообщений (can_delete_messages)');
    }

    return {
      isAdmin: true,
      hasRequiredPermissions: missingPermissions.length === 0,
      missingPermissions,
      isGroupWithTopics: true,
    };
  } catch (error: any) {
    console.error('[Permissions] Error checking bot permissions:', error);
    return {
      isAdmin: false,
      hasRequiredPermissions: false,
      missingPermissions: ['Ошибка при проверке прав'],
      isGroupWithTopics: isTopicsGroup,
    };
  }
}

