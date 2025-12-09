import { Context } from 'telegraf';
import { config } from '../config/env';

/**
 * Middleware для проверки разрешенных групп
 * Бот будет работать только в группах из whitelist
 */
export async function groupWhitelist(ctx: Context, next: () => Promise<void>) {
  // Пропускаем событие изменения статуса бота (my_chat_member)
  // Оно обрабатывается отдельным обработчиком handleGroupJoin
  if (ctx.updateType === 'my_chat_member') {
    return next();
  }

  // Разрешаем личные сообщения (для тестирования или будущего функционала)
  if (!ctx.chat) {
    return next();
  }

  // Если это не группа/супергруппа, пропускаем
  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
    return next();
  }

  const chatId = ctx.chat.id;
  const allowedGroups = config.allowedGroupIds;

  // Если список разрешенных групп пуст, разрешаем все (для разработки)
  if (allowedGroups.length === 0) {
    console.warn('[GroupWhitelist] No allowed groups configured. Allowing all groups.');
    return next();
  }

  // Проверяем, есть ли группа в whitelist
  if (!allowedGroups.includes(chatId)) {
    console.warn(`[GroupWhitelist] Access denied for group ${chatId}`);
    
    // Не отправляем сообщение здесь, так как:
    // 1. Бот может быть не участником группы
    // 2. Обработка добавления в группу уже есть в handleGroupJoin
    // Просто блокируем выполнение команд/обработчиков
    
    return;
  }

  // Группа разрешена, продолжаем
  return next();
}

