import { Context, Markup } from 'telegraf';
import { getDailyTop, getWeeklyTop, getGroupsWithTopEnabled } from '../services/topService';
import { getGroupSettingsComplete } from '../types/crud/group_settings_complete_crud';
import { getDateStringInTimezone } from '../utils/dateHelpers';
/**
 * Экранирует HTML символы для безопасного использования в HTML разметке
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const DATES_PER_PAGE = 10; // Показываем 10 дат на странице
const WEEKS_PER_PAGE = 8; // Показываем 8 недель на странице

type TopMode = 'days' | 'weeks' | null;

/**
 * Команда /top - показывает топ за выбранную дату или неделю
 */
export async function topCommand(ctx: Context) {
  if (!ctx.chat || ctx.chat.type === 'private') {
    await ctx.reply('❌ Эта команда доступна только в группах.');
    return;
  }

  const groupId = ctx.chat.id;
  let page = 0;
  let selectedDate: string | null = null;
  let selectedWeek: string | null = null; // Формат: "YYYY-MM-DD" (дата окончания недели)
  let mode: TopMode = null;

  // Проверяем, если это callback query
  const isFromMenu = ctx.callbackQuery && 'data' in ctx.callbackQuery && 
                     ctx.callbackQuery.data && ctx.callbackQuery.data.startsWith('menu:command:top');
  
  if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
    const data = ctx.callbackQuery.data;
    const parts = data.split(':');
    
    if (parts[0] === 'top') {
      if (parts[1] === 'mode') {
        // Выбран режим (days или weeks) или возврат назад
        if (parts[2] === 'back') {
          mode = null; // Возврат к выбору типа
        } else {
          mode = parts[2] as TopMode;
        }
      } else if (parts[1] === 'page') {
        mode = parts[2] as TopMode;
        page = parseInt(parts[3], 10);
      } else if (parts[1] === 'date') {
        mode = 'days';
        selectedDate = parts[2];
      } else if (parts[1] === 'week') {
        mode = 'weeks';
        selectedWeek = parts[2];
      }
    }
  }

  try {
    // Если не выбран режим, показываем меню выбора режима
    if (!mode) {
      const message = '🏆 <b>Выберите тип топа:</b>';
      const keyboardButtons: any[] = [
        [Markup.button.callback('📅 По дням', 'top:mode:days')],
        [Markup.button.callback('📆 По неделям', 'top:mode:weeks')],
      ];

      // Добавляем кнопку "Назад" если вызвано из меню
      if (isFromMenu || (ctx.callbackQuery && 'message' in ctx.callbackQuery)) {
        keyboardButtons.push([Markup.button.callback('◀️ Назад', 'menu:main')]);
      }

      const keyboard = Markup.inlineKeyboard(keyboardButtons);

      try {
        if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
          await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup,
          });
        } else {
          await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup,
          });
        }
      } catch (error: any) {
        if (error.response?.error_code === 400 && 
            error.response?.description?.includes('message is not modified')) {
          // Игнорируем
        } else {
          throw error;
        }
      }

      if (ctx.callbackQuery) {
        await ctx.answerCbQuery();
      }
      return;
    }

    // Если выбрана дата, показываем топ за эту дату
    if (selectedDate && mode === 'days') {
      const date = new Date(selectedDate + 'T00:00:00');
      const groupsWithTop = await getGroupsWithTopEnabled();
      const groupTops = groupsWithTop.filter(g => g.groupId === groupId);
      
      if (groupTops.length === 0) {
        await ctx.reply('❌ Топ не настроен для этой группы.');
        if (ctx.callbackQuery) {
          await ctx.answerCbQuery('❌ Топ не настроен');
        }
        return;
      }

      // Получаем топ для первой темы (обычно одна тема для топа)
      const topicId = groupTops[0].topicId;
      const topUsers = await getDailyTop(groupId, date);
      
      // Форматируем сообщение
      let message = `🏆 <b>Топ за ${formatDateForDisplay(selectedDate)}</b>\n\n`;
      
      if (topUsers.length === 0) {
        message += 'Нет данных за этот день.';
      } else {
        const topList = topUsers.map((user, index) => {
          const userName = formatUserName(user);
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          return `${medal} ${userName} - ${user.totalPoints} очков`;
        }).join('\n');
        
        message += topList;
      }

      // Кнопка "Назад"
      const backButtons: any[] = [
        Markup.button.callback('◀️ Назад к выбору даты', `top:page:days:0`)
      ];
      if (isFromMenu) {
        backButtons.push(Markup.button.callback('◀️ Назад в меню', 'menu:main'));
      }
      const keyboard = Markup.inlineKeyboard([backButtons]);

      try {
        if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
          await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup,
          });
        } else {
          await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup,
          });
        }
      } catch (error: any) {
        if (error.response?.error_code === 400 && 
            error.response?.description?.includes('message is not modified')) {
          // Игнорируем
        } else {
          throw error;
        }
      }

      if (ctx.callbackQuery) {
        await ctx.answerCbQuery();
      }
      return;
    }

    // Если выбрана неделя, показываем топ за эту неделю
    if (selectedWeek && mode === 'weeks') {
      const endDate = new Date(selectedWeek + 'T00:00:00');
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 6); // 7 дней включая endDate

      const groupsWithTop = await getGroupsWithTopEnabled();
      const groupTops = groupsWithTop.filter(g => g.groupId === groupId);
      
      if (groupTops.length === 0) {
        const errorMessage = '❌ Топ не настроен для этой группы.';
        try {
          if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
            await ctx.editMessageText(errorMessage, { parse_mode: 'HTML' });
          } else {
            await ctx.reply(errorMessage);
          }
        } catch (error: any) {
          await ctx.reply(errorMessage);
        }
        if (ctx.callbackQuery) {
          await ctx.answerCbQuery('❌ Топ не настроен');
        }
        return;
      }

      // Получаем топ для первой темы
      const topicId = groupTops[0].topicId;
      const topUsers = await getWeeklyTop(groupId, endDate);
      
      // Форматируем сообщение
      const startDateStr = formatDateForDisplay(startDate.toISOString().split('T')[0]);
      const endDateStr = formatDateForDisplay(selectedWeek);
      
      let message = `🏆 <b>Топ за неделю (${startDateStr} - ${endDateStr})</b>\n\n`;
      
      if (topUsers.length === 0) {
        message += 'Нет данных за этот период.';
      } else {
        const topList = topUsers.map((user, index) => {
          const userName = formatUserName(user);
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          return `${medal} ${userName} - ${user.totalPoints} очков`;
        }).join('\n');
        
        message += topList;
      }

      // Кнопка "Назад"
      const backButtons: any[] = [
        Markup.button.callback('◀️ Назад к выбору недели', `top:page:weeks:0`)
      ];
      if (isFromMenu) {
        backButtons.push(Markup.button.callback('◀️ Назад в меню', 'menu:main'));
      }
      const keyboard = Markup.inlineKeyboard([backButtons]);

      try {
        if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
          await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup,
          });
        } else {
          await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup,
          });
        }
      } catch (error: any) {
        if (error.response?.error_code === 400 && 
            error.response?.description?.includes('message is not modified')) {
          // Игнорируем
        } else {
          throw error;
        }
      }

      if (ctx.callbackQuery) {
        await ctx.answerCbQuery();
      }
      return;
    }

    // Показываем список дат или недель в зависимости от режима
    if (mode === 'days') {
      // Показываем список дат
    const settings = await getGroupSettingsComplete(groupId);
    const timezone = settings?.groupSettings?.timezone || 'Europe/Kiev';
    
    // Получаем список доступных дат (последние 30 дней)
    const availableDates: string[] = [];
    const now = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = getDateStringInTimezone(timezone, date);
      availableDates.push(dateStr);
    }

    // Применяем пагинацию
    const offset = page * DATES_PER_PAGE;
    const total = availableDates.length;
    const paginatedDates = availableDates.slice(offset, offset + DATES_PER_PAGE);
    const hasMore = offset + paginatedDates.length < total;
    const totalPages = Math.ceil(total / DATES_PER_PAGE);

    // Формируем сообщение
    let message = '🏆 <b>Выберите дату для просмотра топа</b>';
    
    if (totalPages > 1) {
      message += `\n\n📄 Страница ${page + 1} из ${totalPages}`;
    }

    if (paginatedDates.length === 0) {
      message += '\n\n❌ Даты не найдены';
    }

    const keyboard: any[] = [];
    
      // Кнопки выбора даты (вертикально)
      const dateButtons = paginatedDates.map(dateStr => {
        return [Markup.button.callback(
          formatDateForDisplay(dateStr),
          `top:date:${dateStr}`
        )];
      });
      keyboard.push(...dateButtons);

      // Навигация
      const navRow: any[] = [];
      if (page > 0) {
        navRow.push(Markup.button.callback('◀️ Предыдущие', `top:page:days:${page - 1}`));
      }
      if (hasMore) {
        navRow.push(Markup.button.callback('Следующие ▶️', `top:page:days:${page + 1}`));
      }
      if (navRow.length > 0) {
        keyboard.push(navRow);
      }
      // Кнопка "Назад к выбору типа"
      const backRow: any[] = [Markup.button.callback('◀️ Назад к выбору типа', 'top:mode:back')];
      if (isFromMenu) {
        backRow.push(Markup.button.callback('◀️ Назад в меню', 'menu:main'));
      }
      keyboard.push(backRow);

      try {
        if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
          await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard.length > 0 ? Markup.inlineKeyboard(keyboard).reply_markup : undefined,
          });
        } else {
          await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard.length > 0 ? Markup.inlineKeyboard(keyboard).reply_markup : undefined,
          });
        }
      } catch (error: any) {
        if (error.response?.error_code === 400 && 
            error.response?.description?.includes('message is not modified')) {
          // Игнорируем
        } else {
          throw error;
        }
      }
    } else if (mode === 'weeks') {
      // Показываем список недель
      const settings = await getGroupSettingsComplete(groupId);
      const timezone = settings?.groupSettings?.timezone || 'Europe/Kiev';
      
      // Получаем список доступных недель
      const availableWeeks: Array<{ startDate: string; endDate: string }> = [];
      const now = new Date();
      
      // Вычисляем текущую дату в часовом поясе группы
      const todayDateStr = getDateStringInTimezone(timezone);
      const todayDate = new Date(todayDateStr + 'T00:00:00');
      
      // Находим понедельник текущей недели
      const currentDayOfWeek = todayDate.getDay();
      const daysToMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1; // 0 = воскресенье
      const currentWeekMonday = new Date(todayDate);
      currentWeekMonday.setDate(currentWeekMonday.getDate() - daysToMonday);
      
      // Генерируем недели: начинаем с текущей недели и идем назад на 7 недель (всего 8 недель)
      for (let i = 0; i < 8; i++) {
        const weekStart = new Date(currentWeekMonday);
        weekStart.setDate(weekStart.getDate() - (i * 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6); // Воскресенье
        
        const weekStartStr = getDateStringInTimezone(timezone, weekStart);
        const weekEndStr = getDateStringInTimezone(timezone, weekEnd);
        
        availableWeeks.push({
          startDate: weekStartStr,
          endDate: weekEndStr
        });
      }

      // Применяем пагинацию
      const offset = page * WEEKS_PER_PAGE;
      const total = availableWeeks.length;
      const paginatedWeeks = availableWeeks.slice(offset, offset + WEEKS_PER_PAGE);
      const hasMore = offset + paginatedWeeks.length < total;
      const totalPages = Math.ceil(total / WEEKS_PER_PAGE);

      // Формируем сообщение
      let message = '🏆 <b>Выберите неделю для просмотра топа</b>';
      
      if (totalPages > 1) {
        message += `\n\n📄 Страница ${page + 1} из ${totalPages}`;
      }

      if (paginatedWeeks.length === 0) {
        message += '\n\n❌ Недели не найдены';
      }

      const keyboard: any[] = [];
      
      // Кнопки выбора недели (вертикально)
      const weekButtons = paginatedWeeks.map(week => {
        const startDisplay = formatDateForDisplay(week.startDate);
        const endDisplay = formatDateForDisplay(week.endDate);
        return [Markup.button.callback(
          `${startDisplay} - ${endDisplay}`,
          `top:week:${week.endDate}` // Используем endDate как идентификатор недели
        )];
      });
      keyboard.push(...weekButtons);

      // Навигация
      const navRow: any[] = [];
      if (page > 0) {
        navRow.push(Markup.button.callback('◀️ Предыдущие', `top:page:weeks:${page - 1}`));
      }
      if (hasMore) {
        navRow.push(Markup.button.callback('Следующие ▶️', `top:page:weeks:${page + 1}`));
      }
      if (navRow.length > 0) {
        keyboard.push(navRow);
      }
      // Кнопка "Назад к выбору типа"
      const backRow: any[] = [Markup.button.callback('◀️ Назад к выбору типа', 'top:mode:back')];
      if (isFromMenu) {
        backRow.push(Markup.button.callback('◀️ Назад в меню', 'menu:main'));
      }
      keyboard.push(backRow);

      try {
        if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
          await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard.length > 0 ? Markup.inlineKeyboard(keyboard).reply_markup : undefined,
          });
        } else {
          await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard.length > 0 ? Markup.inlineKeyboard(keyboard).reply_markup : undefined,
          });
        }
      } catch (error: any) {
        if (error.response?.error_code === 400 && 
            error.response?.description?.includes('message is not modified')) {
          // Игнорируем
        } else {
          throw error;
        }
      }
    }

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

  } catch (error: any) {
    console.error('[TopCommand] Error:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке топа.');
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('❌ Ошибка');
    }
  }
}

/**
 * Форматирует имя пользователя для отображения
 */
function formatUserName(user: { firstName?: string; lastName?: string; username?: string }): string {
  let name = user.firstName || '';
  if (user.lastName) {
    name += (name ? ' ' : '') + user.lastName;
  }
  if (!name) {
    name = `Пользователь`;
  }
  if (user.username) {
    const escapedName = escapeHtml(name);
    const escapedUsername = escapeHtml(user.username);
    return `${escapedName}(${escapedUsername})`;
  }
  return escapeHtml(name);
}

/**
 * Форматирует дату для отображения (DD.MM.YYYY)
 */
function formatDateForDisplay(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
}

