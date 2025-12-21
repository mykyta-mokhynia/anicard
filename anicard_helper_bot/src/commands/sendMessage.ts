import { Context } from 'telegraf';

/**
 * Команда /send - отправляет сообщение пользователю по ID
 * Формат: /send <userId> <текст сообщения>
 * Доступна из личных сообщений или групп
 */
export async function sendMessageCommand(ctx: Context) {
  // Команда доступна из личных сообщений и групп
  
  // Если команда вызвана в группе, проверяем права администратора
  if (ctx.chat && ctx.chat.type !== 'private' && ctx.from) {
    try {
      const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
      
      if (member.status !== 'administrator' && member.status !== 'creator') {
        await ctx.reply('❌ В группах эта команда доступна только администраторам.');
        return;
      }
    } catch (error: any) {
      console.error('[SendMessage] Error checking admin:', error);
      await ctx.reply('❌ Ошибка при проверке прав доступа.');
      return;
    }
  }

  // Проверяем формат команды
  if (!ctx.message || !('text' in ctx.message)) {
    await ctx.reply('❌ Неверный формат команды.\nИспользование: /send <userId> <текст сообщения>');
    return;
  }

  const commandText = ctx.message.text;
  const parts = commandText.split(' ');

  if (parts.length < 3) {
    await ctx.reply(
      '❌ Неверный формат команды.\n\n' +
      'Использование: <code>/send &lt;userId&gt; &lt;текст сообщения&gt;</code>\n\n' +
      'Пример: <code>/send 123456789 Привет! Это тестовое сообщение.</code>',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const userIdStr = parts[1];
  const userId = parseInt(userIdStr, 10);

  if (isNaN(userId)) {
    await ctx.reply(`❌ Неверный ID пользователя: ${userIdStr}\nID должен быть числом.`);
    return;
  }

  // Объединяем оставшиеся части как текст сообщения
  const messageText = parts.slice(2).join(' ');

  if (!messageText || messageText.trim() === '') {
    await ctx.reply('❌ Текст сообщения не может быть пустым.');
    return;
  }

  try {
    // Отправляем сообщение пользователю
    await ctx.telegram.sendMessage(userId, messageText, {
      parse_mode: 'HTML',
    });

    await ctx.reply(`✅ Сообщение отправлено пользователю ${userId}`);
    console.log(`[SendMessage] ✅ Sent message to user ${userId} from user ${ctx.from?.id || 'unknown'}`);
  } catch (error: any) {
    console.error('[SendMessage] Error sending message:', error);
    
    if (error.response?.error_code === 400) {
      if (error.response?.description?.includes('chat not found')) {
        await ctx.reply(`❌ Пользователь ${userId} не найден или не начинал диалог с ботом.`);
      } else {
        await ctx.reply(`❌ Ошибка: ${error.response?.description || error.message || 'Неизвестная ошибка'}`);
      }
    } else if (error.response?.error_code === 403) {
      const description = error.response?.description || '';
      if (description.includes("can't initiate conversation")) {
        await ctx.reply(`❌ Бот не может начать диалог с пользователем ${userId}.\nПользователь должен сначала написать боту (отправить /start).`);
      } else if (description.includes('bot was blocked')) {
        await ctx.reply(`❌ Пользователь ${userId} заблокировал бота.`);
      } else {
        await ctx.reply(`❌ Доступ запрещен: ${description || 'Пользователь заблокировал бота или запретил отправку сообщений.'}`);
      }
    } else {
      await ctx.reply(`❌ Ошибка при отправке сообщения: ${error.response?.description || error.message || 'Неизвестная ошибка'}`);
    }
  }
}

