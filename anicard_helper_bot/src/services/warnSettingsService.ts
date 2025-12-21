import { Context, Markup } from 'telegraf';
import { getWarnSettings, saveWarnSettings, getUserTotalWarns, getUsersWith3Warns } from './warnService';
import { executeQuery } from '../db';

/**
 * Показывает главное меню настроек варнов
 */
export async function showWarnSettingsMenu(ctx: Context) {
  if (!ctx.chat || !('id' in ctx.chat)) {
    return;
  }

  const groupId = ctx.chat.id;
  
  // Получаем текущие настройки
  const settings = await getWarnSettings(groupId);
  const enabled = settings?.enabled || false;
  const normPoints = settings?.normPoints || 90;
  const reportGroupId = settings?.reportGroupId;
  const reportTopicId = settings?.reportTopicId;

  let message = `⚠️ <b>Настройки варнов</b>\n\n`;
  
  if (!enabled) {
    message += `❌ <b>Система варнов:</b> Выключена\n\n`;
  } else {
    message += `✅ <b>Система варнов:</b> Включена\n\n`;
    message += `📊 <b>Норма очков за неделю:</b> ${normPoints}🔹\n\n`;
    message += `📤 <b>Группа для отчетов:</b> Настроена\n`;
    if (reportTopicId) {
      message += `📑 <b>Тема для отчетов:</b> ID ${reportTopicId}\n`;
    }
    message += `\n`;
  }

  message += `💡 <b>Правила варнов:</b>\n`;
  message += `• Не сыграл КВ = 2 варна\n`;
  message += `• Не играл 2 дня = 3 варна\n`;
  message += `• Не набрал норму = 2 варна\n\n`;

  const keyboard: any[] = [];

  // Включить/выключить систему варнов
  if (!enabled) {
    keyboard.push([
      Markup.button.callback('✅ Включить систему варнов', 'warn:toggle')
    ]);
  } else {
    keyboard.push([
      Markup.button.callback('❌ Выключить систему варнов', 'warn:toggle')
    ]);
    keyboard.push([
      Markup.button.callback('⚙️ Настроить норму очков', 'warn:norm')
    ]);
    keyboard.push([
      Markup.button.callback('📤 Настроить группу для отчетов', 'warn:report_group')
    ]);
    keyboard.push([
      Markup.button.callback('📊 Статистика варнов', 'warn:stats')
    ]);
    keyboard.push([
      Markup.button.callback('🗑️ Удалить все варны', 'warn:delete_all')
    ]);
  }

  // Назад
  keyboard.push([
    Markup.button.callback('◀️ Назад', 'menu:main')
  ]);

  try {
    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
    });
  } catch (error: any) {
    if (error.response?.error_code === 400 && 
        error.response?.description?.includes('message is not modified')) {
      return;
    }
    throw error;
  }
}

/**
 * Показывает меню настройки нормы очков
 */
export async function showNormSettingsMenu(ctx: Context) {
  if (!ctx.chat || !('id' in ctx.chat)) {
    return;
  }

  const groupId = ctx.chat.id;
  const settings = await getWarnSettings(groupId);
  const currentNorm = settings?.normPoints || 90;

  const message = 
    `⚙️ <b>Настройка нормы очков за неделю</b>\n\n` +
    `📊 <b>Текущая норма:</b> ${currentNorm}🔹\n\n` +
    `Выберите новую норму:`;

  const keyboard: any[] = [];

  // Быстрые варианты
  const quickNorms = [50, 70, 90, 100, 120, 150];
  const rows: any[] = [];
  quickNorms.forEach(norm => {
    const label = currentNorm === norm ? `✅ ${norm}🔹` : `${norm}🔹`;
    rows.push(Markup.button.callback(label, `warn:norm:set:${norm}`));
    if (rows.length === 3) {
      keyboard.push([...rows]);
      rows.length = 0;
    }
  });
  if (rows.length > 0) {
    keyboard.push(rows);
  }

  // Кастомное значение
  keyboard.push([
    Markup.button.callback('✏️ Ввести вручную', 'warn:norm:custom')
  ]);

  // Назад
  keyboard.push([
    Markup.button.callback('◀️ Назад', 'warn:main')
  ]);

  try {
    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
    });
  } catch (error: any) {
    if (error.response?.error_code === 400 && 
        error.response?.description?.includes('message is not modified')) {
      return;
    }
    throw error;
  }
}

/**
 * Показывает статистику варнов
 */
export async function showWarnStats(ctx: Context) {
  if (!ctx.chat || !('id' in ctx.chat)) {
    return;
  }

  const groupId = ctx.chat.id;
  
  // Получаем пользователей с 3+ варнами
  const usersWith3Warns = await getUsersWith3Warns(groupId);

  let message = `📊 <b>Статистика варнов</b>\n\n`;

  if (usersWith3Warns.length === 0) {
    message += `✅ Нет пользователей с 3 и более варнами.\n\n`;
  } else {
    message += `⚠️ <b>Пользователей с 3+ варнами:</b> ${usersWith3Warns.length}\n\n`;
    
    for (let i = 0; i < Math.min(usersWith3Warns.length, 10); i++) {
      const user = usersWith3Warns[i];
      const name = formatUserName(user);
      message += `${i + 1}. <b>${name}</b> - ${user.totalWarns} варнов\n`;
    }
    
    if (usersWith3Warns.length > 10) {
      message += `\n... и еще ${usersWith3Warns.length - 10} пользователей\n`;
    }
  }

  // Общая статистика варнов
  const { selectQuery } = await import('../db');
  const totalWarnsQuery = `
    SELECT COUNT(*) as total FROM user_warns WHERE group_id = ?
  `;
  const totalWarns = await selectQuery(totalWarnsQuery, [groupId], false);
  message += `\n📈 <b>Всего варнов выдано:</b> ${totalWarns?.total || 0}`;

  const keyboard: any[] = [];
  keyboard.push([
    Markup.button.callback('◀️ Назад', 'warn:main')
  ]);

  try {
    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
    });
  } catch (error: any) {
    if (error.response?.error_code === 400 && 
        error.response?.description?.includes('message is not modified')) {
      return;
    }
    throw error;
  }
}

/**
 * Форматирует имя пользователя
 */
function formatUserName(user: { firstName?: string; lastName?: string; username?: string; userId: number }): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  if (user.firstName) {
    return user.firstName;
  }
  if (user.username) {
    return user.username;
  }
  return `Пользователь ${user.userId}`;
}

