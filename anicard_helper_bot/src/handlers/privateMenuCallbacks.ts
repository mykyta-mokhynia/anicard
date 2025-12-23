import { Context } from 'telegraf';
import { AccessLevel } from '../types/user';
import { getUserByTelegramId } from '../services/userService';

/**
 * Обработчик текстовых сообщений от reply keyboard в личных сообщениях
 */
export async function handlePrivateMenuText(ctx: Context, text: string): Promise<boolean> {
  // Убираем эмодзи и пробелы для сравнения
  const normalizedText = text.trim();

  switch (normalizedText) {
    case '🔄 Трейды':
      await handleTradesAction(ctx);
      return true;
    case '👥 Кланы':
      await handleClansAction(ctx);
      return true;
    case 'ℹ️ Информация':
      await handleInfoAction(ctx);
      return true;
    case '📨 Запросы':
      await handleRequestsAction(ctx);
      return true;
    case '🔐 Управление аккаунтами':
      await handleAccountsAction(ctx);
      return true;
    case '👤 Управление пользователями':
      await handleUsersAction(ctx);
      return true;
    default:
      return false; // Не обработано, продолжаем обычную обработку
  }
}

/**
 * Обработчики callback для меню в личных сообщениях
 */
export async function handlePrivateMenuCallback(ctx: Context) {
  if (!('data' in ctx.callbackQuery!)) {
    return;
  }

  // Проверяем, что callback из личных сообщений
  if (!ctx.chat || ctx.chat.type !== 'private') {
    try {
      await ctx.answerCbQuery('❌ Эта функция доступна только в личных сообщениях.');
    } catch (e) {
      // Игнорируем ошибки
    }
    return;
  }

  if (!ctx.from) {
    try {
      await ctx.answerCbQuery('❌ Ошибка: не удалось определить пользователя.');
    } catch (e) {
      // Игнорируем ошибки
    }
    return;
  }

  const data = ctx.callbackQuery.data as string;
  
  // Обработка callback для управления аккаунтами
  if (data.startsWith('accounts:')) {
    await ctx.answerCbQuery();
    
    const parts = data.split(':');
    
    if (data === 'accounts:list') {
      await handleAccountsListAction(ctx, 0);
      return;
    } else if (parts[1] === 'list' && parts[2]) {
      const page = parseInt(parts[2], 10);
      await handleAccountsListAction(ctx, isNaN(page) ? 0 : page);
      return;
    } else if (parts[1] === 'group' && parts[2]) {
      const folderName = parts[2];
      const page = parts[3] ? parseInt(parts[3], 10) : 0;
      await handleGroupViewAction(ctx, folderName, isNaN(page) ? 0 : page);
      return;
    } else if (parts[1] === 'account' && parts[2]) {
      const accountId = parseInt(parts[2], 10);
      await handleAccountViewAction(ctx, accountId);
      return;
    } else if (parts[1] === 'settings' && parts[2]) {
      const folderName = parts[2];
      await handleGroupSettingsAction(ctx, folderName);
      return;
    } else if (parts[1] === 'api' && parts[2] === 'setup' && parts[3]) {
      const folderName = parts[3];
      await handleApiSetupAction(ctx, folderName);
      return;
    } else if (parts[1] === 'transfer' && parts[2]) {
      const accountId = parseInt(parts[2], 10);
      await handleTransferToMainAction(ctx, accountId);
      return;
    } else if (parts[1] === 'edit' && parts[2] && parts[3]) {
      const field = parts[2];
      const accountId = parseInt(parts[3], 10);
      const value = parts[4];
      await handleAccountEditAction(ctx, field, accountId, value);
      return;
    } else if (data === 'accounts:add') {
      await handleAddAccountAction(ctx);
      return;
    } else if (parts[1] === 'select_group' && parts[2]) {
      const folderName = parts[2];
      await handleSelectGroupAction(ctx, folderName);
      return;
    } else if (data === 'accounts:create_group') {
      await handleCreateGroupAction(ctx);
      return;
    } else if (parts[1] === 'create_group' && parts[2]) {
      const groupType = parts[2] as 'twinks' | 'main';
      await handleCreateGroupTypeAction(ctx, groupType);
      return;
    } else if (data === 'accounts:back') {
      await handleAccountsListAction(ctx, 0);
      return;
    }
    return;
  }
  
  const parts = data.split(':');

  if (parts.length < 3) {
    return;
  }

  const action = parts[1];
  const userId = parseInt(parts[2], 10);
  const currentUserId = ctx.from.id;

  // Проверяем, что callback вызван тем же пользователем
  if (userId !== currentUserId) {
    try {
      await ctx.answerCbQuery('❌ Это меню открыл другой пользователь. Используйте команду /start для создания своего меню.');
    } catch (e) {
      // Игнорируем ошибки
    }
    return;
  }

  try {
    await ctx.answerCbQuery(); // Подтверждаем нажатие кнопки

    switch (action) {
      case 'trades':
        await handleTradesAction(ctx);
        break;
      case 'clans':
        await handleClansAction(ctx);
        break;
      case 'info':
        await handleInfoAction(ctx);
        break;
      case 'requests':
        await handleRequestsAction(ctx);
        break;
      case 'accounts':
        await handleAccountsAction(ctx);
        break;
      case 'users':
        await handleUsersAction(ctx);
        break;
      case 'close':
        await handleCloseAction(ctx);
        break;
      case 'back':
        // Для reply keyboard не нужен back
        break;
      default:
        console.warn(`[PrivateMenuCallback] Unknown action: ${action}`);
    }
  } catch (error: any) {
    console.error(`[PrivateMenuCallback] Error handling ${data}:`, error);
    try {
      await ctx.answerCbQuery('❌ Произошла ошибка при обработке запроса.');
    } catch (e) {
      // Игнорируем ошибки
    }
  }
}

/**
 * Обработчик кнопки "Трейды"
 */
async function handleTradesAction(ctx: Context) {
  await ctx.reply('🔄 <b>Трейды</b>\n\nФункционал в разработке...', {
    parse_mode: 'HTML',
  });
  console.log(`[PrivateMenu] User ${ctx.from?.id} clicked Trades`);
}

/**
 * Обработчик кнопки "Кланы"
 */
async function handleClansAction(ctx: Context) {
  await ctx.reply('👥 <b>Кланы</b>\n\nФункционал в разработке...', {
    parse_mode: 'HTML',
  });
  console.log(`[PrivateMenu] User ${ctx.from?.id} clicked Clans`);
}

/**
 * Обработчик кнопки "Информация" (только для пользователей с уровнем 2+)
 */
async function handleInfoAction(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const user = await getUserByTelegramId(ctx.from.id);
  
  if (!user || user.accessLevel < AccessLevel.TRADER) {
    await ctx.reply('❌ У вас нет доступа к этой функции.');
    return;
  }

  await ctx.reply('ℹ️ <b>Информация</b>\n\nФункционал в разработке...', {
    parse_mode: 'HTML',
  });
  console.log(`[PrivateMenu] User ${ctx.from.id} clicked Info`);
}

/**
 * Обработчик кнопки "Запросы" (только для трейдеров и выше)
 */
async function handleRequestsAction(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const user = await getUserByTelegramId(ctx.from.id);
  
  if (!user || user.accessLevel < AccessLevel.TRADER) {
    await ctx.reply('❌ У вас нет доступа к этой функции.');
    return;
  }

  await ctx.reply('📨 <b>Запросы</b>\n\nФункционал в разработке...', {
    parse_mode: 'HTML',
  });
  console.log(`[PrivateMenu] User ${ctx.from.id} clicked Requests`);
}

/**
 * Обработчик кнопки "Управление аккаунтами" (только для модераторов и выше)
 */
async function handleAccountsAction(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const user = await getUserByTelegramId(ctx.from.id);
  
  if (!user || user.accessLevel < AccessLevel.MODERATOR) {
    await ctx.reply('❌ У вас нет доступа к этой функции.');
    return;
  }

  // Показываем меню управления аккаунтами с inline-кнопками
  const { Markup } = await import('telegraf');
  const keyboard: any[] = [
    [Markup.button.callback('📋 Список аккаунтов', 'accounts:list')],
    [Markup.button.callback('➕ Добавить аккаунт', 'accounts:add')],
  ];

  const message = '🔐 <b>Управление аккаунтами</b>\n\n' +
    'Выберите действие:';

  // Если это callback, редактируем сообщение, иначе отправляем новое
  if (ctx.callbackQuery && ctx.callbackQuery.message && 'message_id' in ctx.callbackQuery.message) {
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
      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    }
  } else {
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
    });
    }
}

/**
 * Обработчик кнопки "Список аккаунтов" - показывает папки страницами по 5
 */
async function handleAccountsListAction(ctx: Context, page: number = 0) {
  if (!ctx.from) {
    return;
  }

  const user = await getUserByTelegramId(ctx.from.id);
  
  if (!user || user.accessLevel < AccessLevel.MODERATOR) {
    try {
      await ctx.editMessageText('❌ У вас нет доступа к этой функции.');
    } catch {
    await ctx.reply('❌ У вас нет доступа к этой функции.');
    }
    return;
  }

  const { AccountManagementService } = await import('../services/accountManagementService');
  const { Markup } = await import('telegraf');
  const accountService = new AccountManagementService();
  
  try {
    const folders = await accountService.getFolderList();
    
    // Фильтруем main для не-владельцев
    const isOwner = user.accessLevel >= AccessLevel.OWNER;
    const visibleFolders = folders.filter(f => isOwner || f !== 'main');
    
    if (visibleFolders.length === 0) {
      const emptyMessage = '📋 <b>Список аккаунтов</b>\n\n' +
        'Аккаунты не найдены.\n\n' +
        'Используйте кнопку "➕ Добавить аккаунт" для добавления нового аккаунта.';
      
      if (ctx.callbackQuery && ctx.callbackQuery.message && 'message_id' in ctx.callbackQuery.message) {
        try {
          await ctx.editMessageText(emptyMessage, { parse_mode: 'HTML' });
        } catch {
          await ctx.reply(emptyMessage, { parse_mode: 'HTML' });
        }
      } else {
        await ctx.reply(emptyMessage, { parse_mode: 'HTML' });
      }
      return;
    }

    const itemsPerPage = 5;
    const totalPages = Math.ceil(visibleFolders.length / itemsPerPage);
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const startIndex = currentPage * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageFolders = visibleFolders.slice(startIndex, endIndex);

    let message = '📋 <b>Список аккаунтов</b>\n\n';
    message += `Страница ${currentPage + 1} из ${totalPages}\n\n`;

    const keyboard: any[] = [];

    for (const folderName of pageFolders) {
      const groupConfig = accountService.getGroupConfig(folderName);
      const accounts = await accountService.getAccountsInFolder(folderName);
      const hasApi = accountService.hasFolderApi(folderName);
      const apiStatus = hasApi ? '✅' : '⚠️';
      const mainStatus = folderName === 'main' ? '⭐ ' : '';
      
      message += `${apiStatus} ${mainStatus}<b>${folderName}</b> (${accounts.length})\n`;
      keyboard.push([Markup.button.callback(
        `${apiStatus} ${mainStatus}${folderName} (${accounts.length})`,
        `accounts:group:${folderName}:0`
      )]);
    }

    // Навигация по страницам
    const navRow: any[] = [];
    if (currentPage > 0) {
      navRow.push(Markup.button.callback('◀️ Назад', `accounts:list:${currentPage - 1}`));
    }
    if (currentPage < totalPages - 1) {
      navRow.push(Markup.button.callback('Вперед ▶️', `accounts:list:${currentPage + 1}`));
    }
    if (navRow.length > 0) {
      keyboard.push(navRow);
    }

    keyboard.push([Markup.button.callback('◀️ Назад к меню', 'accounts:back')]);

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
      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    }
  } catch (error: any) {
    console.error('[Accounts] Error loading accounts:', error);
    try {
      await ctx.editMessageText('❌ Ошибка при загрузке списка аккаунтов.');
    } catch {
      await ctx.reply('❌ Ошибка при загрузке списка аккаунтов.');
    }
  }
}

/**
 * Обработчик просмотра группы (папки) с аккаунтами
 */
async function handleGroupViewAction(ctx: Context, folderName: string, page: number = 0) {
  if (!ctx.from) {
    return;
  }

  const user = await getUserByTelegramId(ctx.from.id);
  
  if (!user || user.accessLevel < AccessLevel.MODERATOR) {
    try {
      await ctx.editMessageText('❌ У вас нет доступа к этой функции.');
    } catch {
      await ctx.reply('❌ У вас нет доступа к этой функции.');
    }
    return;
  }

  // Проверяем доступ к main
  if (folderName === 'main' && user.accessLevel < AccessLevel.OWNER) {
    try {
      await ctx.editMessageText('❌ У вас нет доступа к этой группе.');
    } catch {
      await ctx.reply('❌ У вас нет доступа к этой группе.');
    }
    return;
  }

  const { AccountManagementService } = await import('../services/accountManagementService');
  const { Markup } = await import('telegraf');
  const accountService = new AccountManagementService();
  
  try {
    const accounts = await accountService.getAccountsInFolder(folderName);
    const groupConfig = accountService.getGroupConfig(folderName);
    const hasApi = accountService.hasFolderApi(folderName);
    
    const itemsPerPage = 5;
    const totalPages = Math.ceil(accounts.length / itemsPerPage);
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const startIndex = currentPage * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageAccounts = accounts.slice(startIndex, endIndex);

    let message = `📁 <b>${folderName}</b>\n\n`;
    
    // Настройки группы
    const maxAccounts = groupConfig?.settings?.maxAccounts || 4;
    const isMainGroup = groupConfig?.settings?.isMainGroup || folderName === 'main';
    const apiStatus = hasApi ? '✅ API настроен' : '⚠️ API не настроен';
    
    message += `<b>Настройки:</b>\n`;
    message += `• Максимум аккаунтов: ${maxAccounts}\n`;
    message += `• Главная группа: ${isMainGroup ? 'Да' : 'Нет'}\n`;
    message += `• ${apiStatus}\n\n`;
    
    message += `<b>Аккаунты (${accounts.length}):</b>\n`;
    message += `Страница ${currentPage + 1} из ${totalPages}\n\n`;

    const keyboard: any[] = [];

    for (const account of pageAccounts) {
        const activeStatus = account.isActive ? '🟢' : '🔴';
        const mainStatus = account.isMain ? '⭐' : '';
        const sessionStatus = account.sessionExists ? '📄' : '❌';
        const username = account.username ? `@${account.username}` : 'нет username';
        
      message += `${activeStatus} ${mainStatus} ${sessionStatus} ${account.phoneNumber} (${username})\n`;
      keyboard.push([Markup.button.callback(
        `${activeStatus} ${mainStatus}${account.phoneNumber}`,
        `accounts:account:${account.id}`
      )]);
    }

    // Навигация по страницам
    const navRow: any[] = [];
    if (currentPage > 0) {
      navRow.push(Markup.button.callback('◀️ Назад', `accounts:group:${folderName}:${currentPage - 1}`));
    }
    if (currentPage < totalPages - 1) {
      navRow.push(Markup.button.callback('Вперед ▶️', `accounts:group:${folderName}:${currentPage + 1}`));
    }
    if (navRow.length > 0) {
      keyboard.push(navRow);
    }

    // Кнопки действий
    keyboard.push([Markup.button.callback('⚙️ Настройки группы', `accounts:settings:${folderName}`)]);
    keyboard.push([Markup.button.callback('◀️ Назад к списку', 'accounts:list:0')]);

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
      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    }
  } catch (error: any) {
    console.error('[Accounts] Error loading group:', error);
    try {
      await ctx.editMessageText('❌ Ошибка при загрузке группы.');
    } catch {
      await ctx.reply('❌ Ошибка при загрузке группы.');
    }
  }
}

/**
 * Обработчик просмотра аккаунта
 */
async function handleAccountViewAction(ctx: Context, accountId: number) {
  if (!ctx.from) {
    return;
  }

  const user = await getUserByTelegramId(ctx.from.id);
  
  if (!user || user.accessLevel < AccessLevel.MODERATOR) {
    try {
      await ctx.editMessageText('❌ У вас нет доступа к этой функции.');
    } catch {
      await ctx.reply('❌ У вас нет доступа к этой функции.');
    }
    return;
  }

  const { AccountManagementService } = await import('../services/accountManagementService');
  const { Markup } = await import('telegraf');
  const accountService = new AccountManagementService();
  
  try {
    const account = await accountService.getAccountById(accountId);
    
    if (!account) {
      try {
        await ctx.editMessageText('❌ Аккаунт не найден.');
      } catch {
        await ctx.reply('❌ Аккаунт не найден.');
      }
      return;
    }

    const folderName = accountService.extractFolderName(account.session_path || account.sessionPath);
    const isMain = account.is_main || account.isMain || false;
    
    // Проверяем доступ к main аккаунтам
    if (isMain && user.accessLevel < AccessLevel.OWNER) {
      try {
        await ctx.editMessageText('❌ У вас нет доступа к этому аккаунту.');
      } catch {
        await ctx.reply('❌ У вас нет доступа к этому аккаунту.');
      }
      return;
    }

    let message = `👤 <b>Аккаунт #${account.id}</b>\n\n`;
    message += `<b>Основная информация:</b>\n`;
    message += `• Телефон: ${account.phone_number || account.phoneNumber}\n`;
    message += `• Telegram ID: ${account.telegram_id || account.telegramId || 'не установлен'}\n`;
    message += `• Username: ${account.username ? `@${account.username}` : 'нет'}\n`;
    message += `• Папка: ${folderName}\n\n`;
    
    message += `<b>Статусы:</b>\n`;
    message += `• Главный: ${isMain ? '⭐ Да' : 'Нет'}\n`;
    message += `• Активен: ${account.is_active || account.isActive ? '🟢 Да' : '🔴 Нет'}\n`;
    message += `• Подписка: ${account.subscription || 'common'}\n`;
    message += `• В клане: ${account.in_clan || account.inClan ? 'Да' : 'Нет'}\n\n`;
    
    message += `<b>Ресурсы:</b>\n`;
    message += `• Боевые монеты: ${account.battle_coins || account.battleCoins || 0}\n`;
    message += `• Боевая эссенция: ${account.battle_essence || account.battleEssence || 0}\n`;
    message += `• Коллективная эссенция: ${account.collective_essence || account.collectiveEssence || 0}\n`;
    message += `• Токены: ${account.tokens || 0}\n`;

    const keyboard: any[] = [];
    
    // Кнопки редактирования (для модераторов и выше)
    const isActive = account.is_active || account.isActive;
    const subscription = account.subscription || 'common';
    const inClan = account.in_clan || account.inClan || false;
    
    keyboard.push([
      Markup.button.callback(
        `Активен: ${isActive ? '🟢 Да' : '🔴 Нет'}`,
        `accounts:edit:active:${accountId}:${isActive ? 'false' : 'true'}`
      )
    ]);
    
    const subscriptionLabels: Record<string, string> = {
      common: 'Common',
      premium: 'Premium',
      platinum: 'Platinum'
    };
    keyboard.push([
      Markup.button.callback(
        `Подписка: ${subscriptionLabels[subscription] || subscription}`,
        `accounts:edit:subscription:${accountId}`
      )
    ]);
    
    keyboard.push([
      Markup.button.callback(
        `В клане: ${inClan ? 'Да' : 'Нет'}`,
        `accounts:edit:in_clan:${accountId}:${inClan ? 'false' : 'true'}`
      )
    ]);
    
    // Кнопка переноса в main (только для владельца и не-main аккаунтов)
    if (user.accessLevel >= AccessLevel.OWNER && !isMain && folderName !== 'main') {
      keyboard.push([Markup.button.callback('📦 Перенести в main', `accounts:transfer:${accountId}`)]);
    }
    
    keyboard.push([Markup.button.callback('◀️ Назад к группе', `accounts:group:${folderName}:0`)]);

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
      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    }
  } catch (error: any) {
    console.error('[Accounts] Error loading account:', error);
    try {
      await ctx.editMessageText('❌ Ошибка при загрузке аккаунта.');
    } catch {
      await ctx.reply('❌ Ошибка при загрузке аккаунта.');
    }
  }
}

/**
 * Обработчик настроек группы
 */
async function handleGroupSettingsAction(ctx: Context, folderName: string) {
  if (!ctx.from) {
    return;
  }

  const user = await getUserByTelegramId(ctx.from.id);
  
  if (!user || user.accessLevel < AccessLevel.MODERATOR) {
    try {
      await ctx.editMessageText('❌ У вас нет доступа к этой функции.');
    } catch {
      await ctx.reply('❌ У вас нет доступа к этой функции.');
    }
    return;
  }

  // Проверяем доступ к main
  if (folderName === 'main' && user.accessLevel < AccessLevel.OWNER) {
    try {
      await ctx.editMessageText('❌ У вас нет доступа к этой группе.');
    } catch {
      await ctx.reply('❌ У вас нет доступа к этой группе.');
    }
    return;
  }

  const { AccountManagementService } = await import('../services/accountManagementService');
  const { Markup } = await import('telegraf');
  const accountService = new AccountManagementService();
  
  try {
    const groupConfig = accountService.getGroupConfig(folderName);
    const hasApi = accountService.hasFolderApi(folderName);
    const accounts = await accountService.getAccountsInFolder(folderName);
    
    let message = `⚙️ <b>Настройки группы: ${folderName}</b>\n\n`;
    
    message += `<b>Основные настройки:</b>\n`;
    message += `• Максимум аккаунтов: ${groupConfig?.settings?.maxAccounts || 4}\n`;
    message += `• Главная группа: ${groupConfig?.settings?.isMainGroup || folderName === 'main' ? 'Да' : 'Нет'}\n`;
    message += `• Описание: ${groupConfig?.settings?.description || 'нет'}\n`;
    message += `• Аккаунтов в группе: ${accounts.length}\n\n`;
    
    const keyboard: any[] = [];

    // API настройки - только для владельца и только для не-main групп
    const isOwner = user.accessLevel >= AccessLevel.OWNER;
    if (folderName !== 'main' && isOwner) {
      message += `<b>API настройки:</b>\n`;
      message += `• Статус: ${hasApi ? '✅ Настроен' : '⚠️ Не настроен'}\n\n`;
      if (!hasApi) {
        message += `Для настройки API используйте кнопку ниже.\n`;
        message += `Имя приложения: anicardautosystem_${folderName.replace('twinks_', '')}\n\n`;
        keyboard.push([Markup.button.callback('🔧 Настроить API', `accounts:api:setup:${folderName}`)]);
      }
    }

    keyboard.push([Markup.button.callback('◀️ Назад к группе', `accounts:group:${folderName}:0`)]);

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
      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    }
  } catch (error: any) {
    console.error('[Accounts] Error loading settings:', error);
    try {
      await ctx.editMessageText('❌ Ошибка при загрузке настроек.');
    } catch {
      await ctx.reply('❌ Ошибка при загрузке настроек.');
    }
  }
}

/**
 * Обработчик установки API
 */
async function handleApiSetupAction(ctx: Context, folderName: string) {
  if (!ctx.from) {
    return;
  }

  const user = await getUserByTelegramId(ctx.from.id);
  
  if (!user || user.accessLevel < AccessLevel.OWNER) {
    try {
      await ctx.editMessageText('❌ У вас нет доступа к этой функции.');
    } catch {
      await ctx.reply('❌ У вас нет доступа к этой функции.');
    }
    return;
  }

  const appName = folderName === 'main' 
    ? 'anicardautosystem' 
    : `anicardautosystem_${folderName.replace('twinks_', '')}`;

  let message = `🔧 <b>Настройка API для ${folderName}</b>\n\n`;
  message += `<b>Инструкция:</b>\n`;
  message += `1. Перейдите на https://my.telegram.org/apps\n`;
  message += `2. Создайте новое приложение или используйте существующее\n`;
  message += `3. Укажите имя приложения: <code>${appName}</code>\n`;
  message += `4. Получите API ID и API Hash\n`;
  message += `5. Создайте файл <code>tg_accounts/session/${folderName}/.env</code>\n`;
  message += `6. Добавьте в файл:\n`;
  message += `<code>TELEGRAM_API_ID=ваш_api_id</code>\n`;
  message += `<code>TELEGRAM_API_HASH=ваш_api_hash</code>\n\n`;
  message += `После создания файла нажмите "Проверить" для проверки настроек.`;

  const { Markup } = await import('telegraf');
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Проверить настройки', `accounts:settings:${folderName}`)],
    [Markup.button.callback('◀️ Назад', `accounts:settings:${folderName}`)],
  ]);

  try {
    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup,
    });
  } catch (error: any) {
    if (error.response?.error_code === 400 && 
        error.response?.description?.includes('message is not modified')) {
      return;
    }
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup,
    });
  }
}

/**
 * Обработчик переноса аккаунта в main
 */
async function handleTransferToMainAction(ctx: Context, accountId: number) {
  if (!ctx.from) {
    return;
  }

  const user = await getUserByTelegramId(ctx.from.id);
  
  if (!user || user.accessLevel < AccessLevel.OWNER) {
    try {
      await ctx.editMessageText('❌ У вас нет доступа к этой функции.');
    } catch {
      await ctx.reply('❌ У вас нет доступа к этой функции.');
    }
    return;
  }

  const { AccountManagementService } = await import('../services/accountManagementService');
  const { Markup } = await import('telegraf');
  const accountService = new AccountManagementService();
  
  try {
    const account = await accountService.getAccountById(accountId);
    
    if (!account) {
      try {
        await ctx.editMessageText('❌ Аккаунт не найден.');
      } catch {
        await ctx.reply('❌ Аккаунт не найден.');
      }
      return;
    }

    const folderName = accountService.extractFolderName(account.session_path || account.sessionPath);
    
    if (folderName === 'main') {
      try {
        await ctx.editMessageText('❌ Аккаунт уже находится в main.');
      } catch {
        await ctx.reply('❌ Аккаунт уже находится в main.');
      }
      return;
    }

    const success = await accountService.transferAccountToMain(accountId);
    
    if (success) {
      const message = `✅ <b>Аккаунт успешно перенесен в main</b>\n\n` +
        `Телефон: ${account.phone_number || account.phoneNumber}\n` +
        `Новая папка: main`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('◀️ Назад к аккаунту', `accounts:account:${accountId}`)],
      ]);

      try {
        await ctx.editMessageText(message, {
          parse_mode: 'HTML',
          reply_markup: keyboard.reply_markup,
        });
      } catch {
        await ctx.reply(message, {
          parse_mode: 'HTML',
          reply_markup: keyboard.reply_markup,
        });
      }
    } else {
      try {
        await ctx.editMessageText('❌ Ошибка при переносе аккаунта.');
      } catch {
        await ctx.reply('❌ Ошибка при переносе аккаунта.');
      }
    }
  } catch (error: any) {
    console.error('[Accounts] Error transferring account:', error);
    try {
      await ctx.editMessageText('❌ Ошибка при переносе аккаунта.');
    } catch {
      await ctx.reply('❌ Ошибка при переносе аккаунта.');
    }
  }
}

/**
 * Обработчик редактирования аккаунта
 */
async function handleAccountEditAction(ctx: Context, field: string, accountId: number, value?: string) {
  if (!ctx.from) {
    return;
  }

  const user = await getUserByTelegramId(ctx.from.id);
  
  if (!user || user.accessLevel < AccessLevel.MODERATOR) {
    try {
      await ctx.editMessageText('❌ У вас нет доступа к этой функции.');
    } catch {
      await ctx.reply('❌ У вас нет доступа к этой функции.');
    }
    return;
  }

  const { AccountManagementService } = await import('../services/accountManagementService');
  const { Markup } = await import('telegraf');
  const accountService = new AccountManagementService();
  
  try {
    const account = await accountService.getAccountById(accountId);
    
    if (!account) {
      try {
        await ctx.editMessageText('❌ Аккаунт не найден.');
      } catch {
        await ctx.reply('❌ Аккаунт не найден.');
      }
      return;
    }

    const isMain = account.is_main || account.isMain || false;
    
    // Проверяем доступ к main аккаунтам
    if (isMain && user.accessLevel < AccessLevel.OWNER) {
      try {
        await ctx.editMessageText('❌ У вас нет доступа к редактированию этого аккаунта.');
      } catch {
        await ctx.reply('❌ У вас нет доступа к редактированию этого аккаунта.');
      }
      return;
    }

    let success = false;
    let message = '';

    if (field === 'active') {
      // Переключение активности
      const newValue = value === 'true';
      success = await accountService.updateAccountActiveStatus(
        accountId,
        newValue,
        user.id,
        user.accessLevel
      );
      message = success 
        ? `✅ Статус активности изменен на: ${newValue ? '🟢 Активен' : '🔴 Неактивен'}`
        : '❌ Ошибка при изменении статуса активности';
    } else if (field === 'subscription') {
      // Выбор подписки
      const currentSubscription = account.subscription || 'common';
      const subscriptions: ('common' | 'premium' | 'platinum')[] = ['common', 'premium', 'platinum'];
      const currentIndex = subscriptions.indexOf(currentSubscription as any);
      const nextIndex = (currentIndex + 1) % subscriptions.length;
      const newSubscription = subscriptions[nextIndex];
      
      success = await accountService.updateAccountSubscription(
        accountId,
        newSubscription,
        user.id,
        user.accessLevel
      );
      message = success 
        ? `✅ Подписка изменена на: ${newSubscription}`
        : '❌ Ошибка при изменении подписки';
    } else if (field === 'in_clan') {
      // Переключение статуса "в клане"
      const newValue = value === 'true';
      success = await accountService.updateAccountInClan(
        accountId,
        newValue,
        user.id,
        user.accessLevel
      );
      message = success 
        ? `✅ Статус "в клане" изменен на: ${newValue ? 'Да' : 'Нет'}`
        : '❌ Ошибка при изменении статуса "в клане"';
    } else {
      message = '❌ Неизвестное поле для редактирования';
    }

    if (success) {
      // Обновляем просмотр аккаунта
      await handleAccountViewAction(ctx, accountId);
    } else {
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('◀️ Назад к аккаунту', `accounts:account:${accountId}`)],
      ]);

      try {
        await ctx.editMessageText(message, {
          parse_mode: 'HTML',
          reply_markup: keyboard.reply_markup,
        });
      } catch {
        await ctx.reply(message, {
          parse_mode: 'HTML',
          reply_markup: keyboard.reply_markup,
        });
      }
    }
  } catch (error: any) {
    console.error('[Accounts] Error editing account:', error);
    try {
      await ctx.editMessageText('❌ Ошибка при редактировании аккаунта.');
    } catch {
      await ctx.reply('❌ Ошибка при редактировании аккаунта.');
    }
  }
}

/**
 * Обработчик кнопки "Добавить аккаунт"
 */
async function handleAddAccountAction(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const user = await getUserByTelegramId(ctx.from.id);
  
  if (!user || user.accessLevel < AccessLevel.MODERATOR) {
    await ctx.reply('❌ У вас нет доступа к этой функции.');
    return;
  }

  const { AccountAddService } = await import('../services/accountAddService');
  const accountAddService = new AccountAddService();
  await accountAddService.startAddAccount(ctx);
}

/**
 * Обработчик кнопки "Назад"
 */
async function handleBackAction(ctx: Context) {
  const { showReplyKeyboard } = await import('../services/privateMenuService');
  await showReplyKeyboard(ctx);
}

/**
 * Обработчик кнопки "Управление пользователями" (только для зам и выше)
 */
async function handleUsersAction(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const user = await getUserByTelegramId(ctx.from.id);
  
  if (!user || user.accessLevel < AccessLevel.DEPUTY) {
    await ctx.reply('❌ У вас нет доступа к этой функции.');
    return;
  }

  await ctx.reply('👤 <b>Управление пользователями</b>\n\nФункционал в разработке...', {
    parse_mode: 'HTML',
  });
  console.log(`[PrivateMenu] User ${ctx.from.id} clicked Users`);
}

/**
 * Обработчик выбора группы для регистрации аккаунта
 */
async function handleSelectGroupAction(ctx: Context, folderName: string) {
  if (!ctx.from) {
    return;
  }

  const { AccountAddService } = await import('../services/accountAddService');
  const accountAddService = new AccountAddService();
  await accountAddService.handleGroupSelection(ctx, folderName);
}

/**
 * Обработчик начала создания новой группы
 */
async function handleCreateGroupAction(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const { AccountAddService } = await import('../services/accountAddService');
  const accountAddService = new AccountAddService();
  await accountAddService.startCreateGroup(ctx);
}

/**
 * Обработчик выбора типа группы (twinks или main)
 */
async function handleCreateGroupTypeAction(ctx: Context, groupType: 'twinks' | 'main') {
  if (!ctx.from) {
    return;
  }

  const { AccountAddService } = await import('../services/accountAddService');
  const accountAddService = new AccountAddService();
  await accountAddService.handleGroupTypeSelection(ctx, groupType);
}

/**
 * Обработчик кнопки "Закрыть"
 */
async function handleCloseAction(ctx: Context) {
  if (ctx.callbackQuery && ctx.callbackQuery.message && 'message_id' in ctx.callbackQuery.message) {
    try {
      await ctx.deleteMessage();
    } catch (error: any) {
      // Если сообщение уже удалено, игнорируем ошибку
      if (error.response?.error_code === 400 && 
          (error.response?.description?.includes('message to delete not found') ||
           error.response?.description?.includes('message can\'t be deleted'))) {
        return;
      }
      console.error('[PrivateMenu] Error deleting message:', error);
    }
  }
  console.log(`[PrivateMenu] User ${ctx.from?.id} closed menu`);
}

