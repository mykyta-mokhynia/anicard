import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { getActiveGroupMembers } from '../services/groupMembersService';

const USERS_PER_PAGE = 15;

/**
 * Команда /users - показывает список пользователей группы с пагинацией
 */
export async function usersCommand(ctx: Context) {
  // Проверяем, что команда вызвана в группе (не в личных сообщениях)
  if (!ctx.chat || ctx.chat.type === 'private') {
    await ctx.reply('❌ Эта команда доступна только в группах.');
    return;
  }

  // Проверяем, что это группа или супергруппа
  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
    await ctx.reply('❌ Эта команда доступна только в группах.');
    return;
  }

  const groupId = ctx.chat.id;

  try {
    await showUsersList(ctx, groupId, 0);
  } catch (error: any) {
    console.error('[Users] Error:', error);
    await ctx.reply('❌ Произошла ошибка при получении списка пользователей.');
  }
}

/**
 * Показывает список пользователей с пагинацией
 */
export async function showUsersList(ctx: Context, groupId: number, page: number = 0): Promise<void> {
  // Получаем всех активных участников группы
  const allMembers = await getActiveGroupMembers(groupId);
  
  // Применяем пагинацию
  const offset = page * USERS_PER_PAGE;
  const total = allMembers.length;
  const paginatedMembers = allMembers.slice(offset, offset + USERS_PER_PAGE);
  const hasMore = offset + paginatedMembers.length < total;
  const totalPages = Math.ceil(total / USERS_PER_PAGE);

  // Формируем сообщение
  let message = '👥 <b>Пользователи</b>\n\n';
  
  if (totalPages > 1) {
    message += `📄 Страница ${page + 1} из ${totalPages}\n\n`;
  }

  if (paginatedMembers.length === 0) {
    message += '❌ Пользователи не найдены';
  } else {
    const userList = paginatedMembers.map((user, index) => {
      const globalIndex = offset + index + 1;
      
      // Формируем имя
      let name = user.firstName || '';
      if (user.lastName) {
        name += (name ? ' ' : '') + user.lastName;
      }
      if (!name) {
        name = `Пользователь ${user.userId}`;
      }
      
      // Экранируем имя для HTML
      const escapedName = escapeHtml(name);
      
      // Форматируем: 1. name(username) где username без @ (без кликабельных ссылок, чтобы не отмечать пользователей)
      if (user.username) {
        const escapedUsername = escapeHtml(user.username);
        return `${globalIndex}. ${escapedName}(${escapedUsername})`;
      } else {
        return `${globalIndex}. ${escapedName}`;
      }
    }).join('\n');
    
    message += userList;
    message += `\n\n📊 Всего: ${total}`;
  }

  // Создаем клавиатуру с навигацией
  const keyboard: any[] = [];
  
  const navRow: any[] = [];
  if (page > 0) {
    navRow.push(Markup.button.callback('◀️ Предыдущие', `users:page:${page - 1}`));
  }
  if (hasMore) {
    navRow.push(Markup.button.callback('Следующие ▶️', `users:page:${page + 1}`));
  }
  if (navRow.length > 0) {
    keyboard.push(navRow);
  }

  // Кнопка "Назад" (если вызвано из меню)
  const isFromMenu = ctx.callbackQuery && 'data' in ctx.callbackQuery && 
                     ctx.callbackQuery.data && ctx.callbackQuery.data.startsWith('menu:command:users');
  if (isFromMenu || (ctx.callbackQuery && 'message' in ctx.callbackQuery)) {
    keyboard.push([
      Markup.button.callback('◀️ Назад', 'menu:main')
    ]);
  }

  try {
    if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
      // Обновляем существующее сообщение
      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        reply_markup: keyboard.length > 0 ? Markup.inlineKeyboard(keyboard).reply_markup : undefined,
      });
      await ctx.answerCbQuery();
    } else {
      // Отправляем новое сообщение
      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: keyboard.length > 0 ? Markup.inlineKeyboard(keyboard).reply_markup : undefined,
      });
    }
  } catch (error: any) {
    // Игнорируем ошибку, если сообщение не изменилось
    if (error.response?.error_code === 400 && 
        error.response?.description?.includes('message is not modified')) {
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery();
      }
      return;
    }
    throw error;
  }
}

/**
 * Экранирует HTML символы
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

