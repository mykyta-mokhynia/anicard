import { Context, Markup } from 'telegraf';
import { executeQuery, selectQuery } from '../db';
import { upsertGroupMember } from './groupMembersService';

/**
 * Экранирует HTML символы для безопасного использования в HTML разметке
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Создает и закрепляет сообщение с кнопкой регистрации
 */
export async function createRegistrationMessage(ctx: Context, groupId: number): Promise<number | null> {
  const message = 
    '⚔️ <b>Регистрация участников клана AniCard Gods</b>\n\n' +
    'Это необходимо для всех участников клана!\n\n' +
    'Для участия в клановых и демонических сражениях, а также для получения уведомлений о сборах, необходимо зарегистрироваться в системе бота.\n\n' +
    'Нажмите на кнопку ниже для регистрации:';

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Зарегистрироваться', `registration:register:${groupId}`),
    ],
  ]);

  try {
    const sentMessage = await ctx.telegram.sendMessage(groupId, message, {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup,
    });

    // Закрепляем сообщение
    try {
      await ctx.telegram.pinChatMessage(groupId, sentMessage.message_id);
      console.log(`[Registration] ✅ Pinned registration message in group ${groupId}`);
    } catch (pinError: any) {
      console.warn(`[Registration] ⚠️ Could not pin message in group ${groupId}:`, pinError.message);
      // Не критично, продолжаем
    }

    // Сохраняем ID закрепленного сообщения в БД (можно использовать для обновления)
    await saveRegistrationMessageId(groupId, sentMessage.message_id);

    console.log(`[Registration] ✅ Created registration message in group ${groupId}`);
    return sentMessage.message_id;
  } catch (error: any) {
    console.error('[Registration] ❌ Error creating registration message:', error);
    return null;
  }
}

/**
 * Отправляет приветственное сообщение новому пользователю
 */
export async function sendWelcomeMessageToUser(
  ctx: Context,
  groupId: number,
  userId: number,
  firstName?: string,
  username?: string
): Promise<void> {
  const userName = escapeHtml(firstName || username || 'друг');
  const mention = `<a href="tg://user?id=${userId}">${userName}</a>`;

  const message = 
    `Привет, ${mention}! 👋\n\n` +
    `Добро пожаловать в AniCard Gods! 🎮⚔️\n\n` +
    `Для участия в клановых и демонических сражениях, а также для получения уведомлений о сборах, необходимо зарегистрироваться в системе бота.\n\n` +
    `Нажмите на кнопку ниже для регистрации:`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Зарегистрироваться', `registration:register:${groupId}`),
    ],
  ]);

  try {
    // НЕ отправляем кнопку регистрации в личные сообщения
    // Регистрация должна происходить только в группах
    // Отправляем только приветственное сообщение в группе
    console.log(`[Registration] Sending welcome message to user ${userId} in group ${groupId}`);

    await ctx.telegram.sendMessage(groupId, message, {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup,
    });
    console.log(`[Registration] ✅ Sent welcome message to user ${userId} (in group)`);
  } catch (error: any) {
    console.error(`[Registration] ❌ Error sending welcome message to user ${userId}:`, error);
  }
}

/**
 * Обрабатывает регистрацию пользователя
 */
export async function handleUserRegistration(
  ctx: Context,
  groupId: number,
  userId: number
): Promise<boolean> {
  try {
    // Дополнительная проверка: ID группы должен быть отрицательным
    // Группы в Telegram имеют отрицательные ID, личные чаты - положительные
    if (groupId > 0) {
      console.warn(`[Registration] ❌ Invalid group ID (positive): ${groupId}. Groups must have negative IDs.`);
      throw new Error('Регистрация возможна только в группах. ID группы должен быть отрицательным.');
    }

    // Проверяем, не зарегистрирован ли уже пользователь
    const existingMember = await selectQuery(
      `SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'member'`,
      [groupId, userId],
      false
    );

    if (existingMember) {
      // Пользователь уже зарегистрирован
      return false;
    }

    // Получаем информацию о пользователе
    let firstName: string | undefined;
    let lastName: string | undefined;
    let username: string | undefined;

    try {
      const user = await ctx.telegram.getChatMember(groupId, userId);
      if ('user' in user) {
        firstName = user.user.first_name;
        lastName = user.user.last_name;
        username = user.user.username;
      }
    } catch (error) {
      // Если не удалось получить информацию, используем данные из ctx
      if (ctx.from) {
        firstName = ctx.from.first_name;
        lastName = ctx.from.last_name;
        username = ctx.from.username;
      }
    }

    // Регистрируем пользователя
    await upsertGroupMember(
      groupId,
      userId,
      firstName,
      lastName,
      username,
      'member'
    );

    // Сохраняем время регистрации (можно добавить отдельное поле в БД, но пока используем updated_at)
    await executeQuery(
      `UPDATE group_members SET updated_at = CURRENT_TIMESTAMP WHERE group_id = ? AND user_id = ?`,
      [groupId, userId]
    );

    console.log(`[Registration] ✅ User ${userId} registered in group ${groupId}`);
    return true;
  } catch (error: any) {
    console.error(`[Registration] ❌ Error registering user ${userId} in group ${groupId}:`, error);
    return false;
  }
}

/**
 * Сохраняет ID сообщения регистрации в БД (для возможного обновления)
 */
async function saveRegistrationMessageId(groupId: number, messageId: number): Promise<void> {
  // Можно добавить отдельную таблицу для хранения ID закрепленных сообщений
  // Пока просто логируем
  console.log(`[Registration] Registration message ID ${messageId} for group ${groupId}`);
}

/**
 * Получает ID закрепленного сообщения регистрации (если нужно)
 */
export async function getRegistrationMessageId(groupId: number): Promise<number | null> {
  // Можно добавить отдельную таблицу для хранения ID закрепленных сообщений
  // Пока возвращаем null
  return null;
}

