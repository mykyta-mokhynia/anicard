import { Context, Markup } from 'telegraf';
import { AccountAddStateService, AccountAddState } from './accountAddStateService';
import { AccountManagementService } from './accountManagementService';
import { executeQuery, selectQuery } from '../db';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as http from 'http';

/**
 * Сервис для добавления нового аккаунта через процесс авторизации
 */
export class AccountAddService {
  private stateService: AccountAddStateService;
  private accountManagementService: AccountManagementService;
  private baseSessionPath: string;
  private authServiceUrl: string;

  constructor() {
    this.stateService = new AccountAddStateService();
    this.accountManagementService = new AccountManagementService();
    // Путь к папке session относительно корня проекта Anicard
    // Если запускаем из anicard_helper_bot, нужно подняться на уровень выше
    const projectRoot = process.cwd().includes('anicard_helper_bot') 
      ? path.resolve(process.cwd(), '..')
      : process.cwd();
    this.baseSessionPath = path.resolve(projectRoot, 'tg_accounts', 'session');
    this.authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:5001';
  }

  /**
   * Начинает процесс добавления аккаунта - показывает выбор группы
   */
  async startAddAccount(ctx: Context): Promise<void> {
    if (!ctx.from) {
      return;
    }

    const userId = ctx.from.id;
    
    // Получаем уровень доступа пользователя
    const { getUserByTelegramId } = await import('../services/userService');
    const { AccessLevel } = await import('../types/user');
    const user = await getUserByTelegramId(userId);
    const userAccessLevel = user?.accessLevel || AccessLevel.MEMBER;

    // Получаем доступные группы для регистрации
    const availableGroups = await this.accountManagementService.getAvailableGroupsForRegistration(userAccessLevel);
    
    // Если это callback от inline-кнопки, редактируем сообщение
    let messageId: number | undefined;
    
    let message = '➕ <b>Добавление аккаунта</b>\n\n';
    
    if (availableGroups.length === 0) {
      message += '❌ Нет доступных групп для регистрации.\n\n';
      message += 'Все группы заполнены или не имеют настроенного API.\n\n';
      message += 'Создайте новую группу через кнопку «➕ Создать новую группу» ниже.';
      
      if (ctx.callbackQuery && ctx.callbackQuery.message && 'message_id' in ctx.callbackQuery.message) {
        try {
          await ctx.editMessageText(message, { parse_mode: 'HTML' });
        } catch (error: any) {
          await ctx.reply(message, { parse_mode: 'HTML' });
        }
      } else {
        await ctx.reply(message, { parse_mode: 'HTML' });
      }
      return;
    }

    message += 'Выберите группу для регистрации аккаунта:\n\n';
    
    const keyboard: any[] = [];
    
    for (const group of availableGroups) {
      const maxAccounts = group.maxAccounts || 4;
      const freeSlots = maxAccounts - group.accountCount;
      const mainStatus = group.isMainGroup ? '⭐ ' : '';
      const status = group.hasApi ? '✅' : '⚠️';
      
      message += `${status} ${mainStatus}<b>${group.folderName}</b> (${group.accountCount}/${maxAccounts}, свободно: ${freeSlots})\n`;
      
      keyboard.push([
        Markup.button.callback(
          `${status} ${mainStatus}${group.folderName} (${freeSlots} свободно)`,
          `accounts:select_group:${group.folderName}`
        )
      ]);
    }
    
    // Кнопка для создания новой группы (только для DEPUTY+), доступна из меню "Добавить аккаунт"
    if (userAccessLevel >= AccessLevel.DEPUTY) {
      keyboard.push([
        Markup.button.callback('➕ Создать новую группу', 'accounts:create_group')
      ]);
    }
    
    keyboard.push([
      Markup.button.callback('❌ Отмена', 'accounts:back')
    ]);

    if (ctx.callbackQuery && ctx.callbackQuery.message && 'message_id' in ctx.callbackQuery.message) {
      messageId = ctx.callbackQuery.message.message_id;
      try {
        await ctx.editMessageText(message, {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
        });
      } catch (error: any) {
        const sentMessage = await ctx.reply(message, {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
        });
        messageId = 'message_id' in sentMessage ? sentMessage.message_id : undefined;
      }
    } else {
      const sentMessage = await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
      messageId = 'message_id' in sentMessage ? sentMessage.message_id : undefined;
    }
    
    this.stateService.setState(userId, AccountAddState.WAITING_GROUP_SELECTION, undefined, { messageId });
  }

  /**
   * Обрабатывает выбор группы для регистрации аккаунта
   */
  async handleGroupSelection(ctx: Context, folderName: string): Promise<boolean> {
    if (!ctx.from) {
      return false;
    }

    const userId = ctx.from.id;
    const state = this.stateService.getState(userId);

    if (!state || state.state !== AccountAddState.WAITING_GROUP_SELECTION) {
      return false;
    }

    // Проверяем, что группа существует и имеет валидный API
    const folderConfig = this.accountManagementService.getFolderConfig(folderName);
    if (!folderConfig) {
      await this.sendMessage(
        ctx,
        '❌ <b>Ошибка</b>\n\n' +
        `Группа "${folderName}" не имеет настроенного API.\n\n` +
        'Выберите другую группу или создайте новую с API.',
        { parse_mode: 'HTML' }
      );
      return true;
    }

    // Проверяем, есть ли свободные слоты
    const accounts = await this.accountManagementService.getAccountsInFolder(folderName);
    const groupConfig = this.accountManagementService.getGroupConfig(folderName);
    const maxAccounts = groupConfig?.settings?.maxAccounts || 4;
    
    if (accounts.length >= maxAccounts) {
      await this.sendMessage(
        ctx,
        '❌ <b>Группа заполнена</b>\n\n' +
        `Группа "${folderName}" уже содержит максимальное количество аккаунтов (${maxAccounts}).\n\n` +
        'Выберите другую группу или создайте новую.',
        { parse_mode: 'HTML' }
      );
      return true;
    }

    // Сохраняем выбранную группу и переходим к вводу номера телефона
    this.stateService.setState(userId, AccountAddState.WAITING_PHONE, undefined, {
      messageId: state.messageId,
      folderName,
      folderConfig,
    });

    const cancelKeyboard = Markup.keyboard([['❌ Отмена']]).oneTime().resize();

    await ctx.reply(
      '✅ <b>Группа выбрана</b>\n\n' +
      `Группа: <b>${folderName}</b>\n\n` +
      'Отправьте номер телефона в международном формате (например: +380123456789):',
      {
        parse_mode: 'HTML',
        ...cancelKeyboard,
      }
    );

    return true;
  }

  /**
   * Обрабатывает номер телефона и запрашивает код
   */
  async handlePhoneNumber(ctx: Context, phoneNumber: string): Promise<boolean> {
    if (!ctx.from) {
      return false;
    }

    const userId = ctx.from.id;
    const state = this.stateService.getState(userId);

    if (!state || state.state !== AccountAddState.WAITING_PHONE) {
      return false;
    }

    // Проверяем, что группа уже выбрана
    if (!state.folderName || !state.folderConfig) {
      await this.sendMessage(ctx, '❌ Ошибка: группа не выбрана. Начните процесс заново.');
      this.stateService.clearState(userId);
      return true;
    }

    // Валидация номера телефона
    const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');
    if (!cleanPhone.match(/^\+?[1-9]\d{10,14}$/)) {
      await this.sendMessage(ctx, '❌ Неверный формат номера телефона. Используйте международный формат (например: +380123456789)');
      return true;
    }

    // Проверяем, не существует ли уже аккаунт с таким номером
    const existingAccount = await selectQuery(
      'SELECT id FROM telegram_accounts WHERE phone_number = ?',
      [cleanPhone],
      false
    );

    if (existingAccount) {
      await this.sendMessage(ctx, '❌ Аккаунт с таким номером уже существует.');
      this.stateService.clearState(userId);
      return true;
    }

    // Используем выбранную группу и её API конфигурацию
    const folderName = state.folderName;
    const folderConfig = state.folderConfig;

    try {
      // Генерируем уникальный session_id для Python сервиса
      const sessionId = `auth_${userId}_${Date.now()}`;
      
      // Вызываем Python сервис для отправки кода
      // TODO: Обновить Python сервис для поддержки передачи api_id/api_hash
      const response = await this.callAuthService('/auth/send_code', {
        phone: cleanPhone,
        session_id: sessionId,
      });

      if (!response.success) {
        throw new Error(response.error || response.message || 'Failed to send code');
      }

      // Сохраняем временные данные в состояние
      this.stateService.setState(userId, AccountAddState.WAITING_CODE, cleanPhone, {
        messageId: state.messageId,
        phoneCodeHash: response.phone_code_hash,
        sessionId, // Сохраняем session_id для Python сервиса
        folderName,
        folderConfig,
      });

      // Отправляем новое сообщение (не редактируем)
      await ctx.reply(
        '📱 <b>Код отправлен</b>\n\n' +
        `Номер: ${cleanPhone}\n\n` +
        'Отправьте код подтверждения, который пришел в Telegram:',
        { parse_mode: 'HTML' }
      );
    } catch (error: any) {
      const errorMessage = error.message || 'Неизвестная ошибка';
      let userMessage = '';
      
      if (errorMessage.includes('PHONE_INVALID')) {
        userMessage = '❌ <b>Неверный номер телефона</b>\n\n' +
          'Проверьте формат номера и попробуйте еще раз.';
      } else if (errorMessage.includes('PHONE_NOT_REGISTERED')) {
        userMessage = '❌ <b>Номер не зарегистрирован</b>\n\n' +
          'Этот номер телефона не зарегистрирован в Telegram.';
      } else if (errorMessage.includes('FLOOD_WAIT')) {
        const seconds = error.seconds || 60;
        userMessage = '⏳ <b>Слишком много запросов</b>\n\n' +
          `Подождите ${seconds} секунд перед повторной попыткой.`;
      } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')) {
        userMessage = '❌ <b>Сервис авторизации недоступен</b>\n\n' +
          'Python сервис не запущен. Запустите: cd tg_accounts && python auth_service.py';
      } else {
        userMessage = '❌ <b>Ошибка при отправке кода</b>\n\n' + errorMessage;
      }
      
      await this.sendMessage(ctx, userMessage, { parse_mode: 'HTML' });
      this.stateService.clearState(userId);
      return true;
    }

    return true;
  }

  /**
   * Обрабатывает код подтверждения и завершает добавление аккаунта
   */
  async handleCode(ctx: Context, code: string): Promise<boolean> {
    if (!ctx.from) {
      return false;
    }

    const userId = ctx.from.id;
    const state = this.stateService.getState(userId);

    if (!state || state.state !== AccountAddState.WAITING_CODE || !state.phoneNumber) {
      return false;
    }

    const phoneNumber = state.phoneNumber;
    const sessionId = state.sessionId;
    const folderName = state.folderName;

    if (!sessionId || !folderName || !phoneNumber) {
      await this.sendMessage(ctx, '❌ Ошибка: данные сессии потеряны. Начните процесс заново.');
      this.stateService.clearState(userId);
      return true;
    }

    try {
      // Парсим код
      const codeNumber = parseInt(code.replace(/\D/g, ''), 10);
      if (isNaN(codeNumber)) {
        await this.sendMessage(ctx, '❌ Неверный формат кода. Отправьте только цифры.');
        return true;
      }
      
      // Получаем API конфигурацию группы
      const folderConfig = this.accountManagementService.getFolderConfig(folderName);
      if (!folderConfig) {
        await this.sendMessage(ctx, '❌ Ошибка: API конфигурация группы потеряна. Начните процесс заново.');
        this.stateService.clearState(userId);
        return true;
      }

      // Вызываем Python сервис для входа с кодом
      // TODO: Обновить Python сервис для поддержки передачи api_id/api_hash
      const response = await this.callAuthService('/auth/sign_in', {
        session_id: sessionId,
        code: codeNumber.toString(),
        folder_name: folderName,
      });

      if (!response.success) {
        throw new Error(response.error || response.message || 'Failed to sign in');
      }

      // Создаем запись в БД
      const sessionPath = response.session_path;
      
      const query = `
        INSERT INTO telegram_accounts 
        (phone_number, session_path, telegram_id, username, subscription, is_main, battle_coins, battle_essence, collective_essence, tokens, in_clan, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await executeQuery(query, [
        phoneNumber,
        sessionPath,
        response.telegram_id,
        response.username || null,
        'common',
        false, // is_main - всегда false для новых аккаунтов
        0, 0, 0, 0, false, true,
      ]);

      await this.sendMessage(
        ctx,
        '✅ <b>Аккаунт успешно добавлен!</b>',
        {
          parse_mode: 'HTML',
          reply_markup: { remove_keyboard: true },
        }
      );

      this.stateService.clearState(userId);
      return true;
    } catch (error: any) {
      // Обработка специфичных ошибок
      let errorMessage = error.message || 'Неизвестная ошибка';
      
      // Проверяем, есть ли детальное сообщение об ошибке в response
      if (error.response && error.response.message) {
        errorMessage = error.response.message;
      }
      
      if (errorMessage.includes('CODE_INVALID')) {
        errorMessage = 'Неверный код подтверждения. Попробуйте еще раз.';
      } else if (errorMessage.includes('CODE_EXPIRED')) {
        errorMessage = 'Код истек. Начните процесс заново.';
      } else if (errorMessage.includes('PASSWORD_NEEDED')) {
        errorMessage = 'Требуется пароль 2FA. Эта функция пока не поддерживается.';
      } else if (errorMessage.includes('SESSION_NOT_FOUND') || errorMessage.includes('Session not found')) {
        errorMessage = 'Сессия не найдена. Начните процесс добавления аккаунта заново.';
      } else if (errorMessage.includes('SESSION_DATA_ERROR') || errorMessage.includes('Missing data in session')) {
        errorMessage = 'Ошибка данных сессии. Начните процесс заново.';
      } else if (errorMessage.includes('SESSION_CREATION_ERROR')) {
        errorMessage = 'Ошибка создания сессии. Попробуйте еще раз.';
      } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')) {
        errorMessage = 'Сервис авторизации недоступен. Запустите: cd tg_accounts && python auth_service.py';
      }
      
      await this.sendMessage(
        ctx,
        '❌ <b>Ошибка при авторизации</b>\n\n' + errorMessage,
        { parse_mode: 'HTML' }
      );
      this.stateService.clearState(userId);
      return true;
    }
  }

  /**
   * Проверяет, находится ли пользователь в процессе добавления аккаунта
   */
  isInProcess(userId: number): boolean {
    return this.stateService.isInProcess(userId);
  }

  /**
   * Получает состояние пользователя
   */
  getState(userId: number) {
    return this.stateService.getState(userId);
  }

  /**
   * Отменяет процесс добавления аккаунта
   */
  cancelProcess(userId: number): void {
    const state = this.stateService.getState(userId);
    if (state && state.sessionId) {
      // Отменяем сессию в Python сервисе
      this.callAuthService('/auth/cancel', { session_id: state.sessionId }).catch(() => {
        // Игнорируем ошибки
      });
    }
    this.stateService.clearState(userId);
  }

  /**
   * Вызывает Python сервис авторизации
   */
  private async callAuthService(endpoint: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.authServiceUrl);
      const postData = JSON.stringify(data);
      
      const options = {
        hostname: url.hostname,
        port: url.port || 5001,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 30000, // 30 секунд таймаут
      };

      const req = http.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk.toString();
        });

        res.on('end', () => {
          if (!responseData || responseData.trim() === '') {
            reject(new Error(`Empty response from auth service. Is it running? Check: ${this.authServiceUrl}`));
            return;
          }
          
          try {
            const parsed = JSON.parse(responseData);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              // Проверяем, есть ли ошибка в успешном ответе (Python сервис может вернуть 200 с error)
              if (parsed.error && !parsed.success) {
                const errorObj = new Error(parsed.error);
                (errorObj as any).response = parsed; // Сохраняем полный ответ для детальной обработки
                reject(errorObj);
                return;
              }
              resolve(parsed);
            } else {
              const errorObj = new Error(parsed.error || parsed.message || `Request failed with status ${res.statusCode}`);
              (errorObj as any).response = parsed; // Сохраняем полный ответ для детальной обработки
              reject(errorObj);
            }
          } catch (error: any) {
            console.error(`[AccountAdd] Failed to parse response. Raw data:`, responseData);
            reject(new Error(`Failed to parse response: ${error.message}. Response: ${responseData.substring(0, 100)}`));
          }
        });
      });

      req.on('error', (error: any) => {
        if (error.code === 'ECONNREFUSED') {
          reject(new Error(`Cannot connect to auth service at ${this.authServiceUrl}. Is it running? Start it with: cd tg_accounts && python auth_service.py`));
        } else {
          reject(error);
        }
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after 30s. Is auth service running?`));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Отправляет новое сообщение (всегда новое, не редактирует старое)
   */
  private async sendMessage(ctx: Context, text: string, options?: any): Promise<void> {
    await ctx.reply(text, options);
  }

  /**
   * Начинает процесс создания новой группы
   */
  async startCreateGroup(ctx: Context): Promise<void> {
    if (!ctx.from) {
      return;
    }

    const userId = ctx.from.id;
    
    // Получаем уровень доступа пользователя
    const { getUserByTelegramId } = await import('../services/userService');
    const { AccessLevel } = await import('../types/user');
    const user = await getUserByTelegramId(userId);
    const userAccessLevel = user?.accessLevel || AccessLevel.MEMBER;

    // Проверяем права: DEPUTY+ для обычных групп, OWNER для main
    if (userAccessLevel < AccessLevel.DEPUTY) {
      await this.sendMessage(ctx, '❌ У вас нет доступа к созданию групп. Требуется уровень DEPUTY или выше.');
      return;
    }

    // Если это callback, редактируем сообщение
    let messageId: number | undefined;
    const text =
      '➕ <b>Создание новой группы</b>\n\n' +
      'Выберите тип группы:';

    const keyboard: any[] = [];

    // Кнопка для создания обычной группы (twinks_X)
    keyboard.push([
      Markup.button.callback('📁 Обычная группа (twinks_X)', 'accounts:create_group:twinks')
    ]);

    // Кнопка для создания main группы (только для OWNER)
    if (userAccessLevel >= AccessLevel.OWNER) {
      keyboard.push([
        Markup.button.callback('⭐ Главная группа (main)', 'accounts:create_group:main')
      ]);
    }

    keyboard.push([
      Markup.button.callback('❌ Отмена', 'accounts:back')
    ]);

    if (ctx.callbackQuery && ctx.callbackQuery.message && 'message_id' in ctx.callbackQuery.message) {
      messageId = ctx.callbackQuery.message.message_id;
      try {
        await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
        });
      } catch (error: any) {
        const message = await ctx.reply(text, {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
        });
        messageId = 'message_id' in message ? message.message_id : undefined;
      }
    } else {
      const message = await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
      messageId = 'message_id' in message ? message.message_id : undefined;
    }

    this.stateService.setState(userId, AccountAddState.WAITING_GROUP_NAME, undefined, { messageId });
  }

  /**
   * Обрабатывает выбор типа группы (twinks или main)
   */
  async handleGroupTypeSelection(ctx: Context, groupType: 'twinks' | 'main'): Promise<boolean> {
    if (!ctx.from) {
      return false;
    }

    const userId = ctx.from.id;
    const state = this.stateService.getState(userId);

    if (!state || state.state !== AccountAddState.WAITING_GROUP_NAME) {
      return false;
    }

    // Получаем уровень доступа пользователя
    const { getUserByTelegramId } = await import('../services/userService');
    const { AccessLevel } = await import('../types/user');
    const user = await getUserByTelegramId(userId);
    const userAccessLevel = user?.accessLevel || AccessLevel.MEMBER;

    let folderName: string;
    let isMainGroup = false;

    if (groupType === 'main') {
      // Проверяем права для main
      if (userAccessLevel < AccessLevel.OWNER) {
        await this.sendMessage(ctx, '❌ У вас нет доступа к созданию главной группы. Требуется уровень OWNER.');
        this.stateService.clearState(userId);
        return true;
      }
      folderName = 'main';
      isMainGroup = true;
    } else {
      // Генерируем имя для twinks группы
      folderName = await this.accountManagementService.getNextAvailableGroupName();
    }

    // Проверяем, не существует ли уже такая группа
    if (this.accountManagementService.groupExists(folderName)) {
      await this.sendMessage(ctx, `❌ Группа "${folderName}" уже существует.`);
      this.stateService.clearState(userId);
      return true;
    }

    // Сохраняем имя группы и переходим к вводу API ID
    this.stateService.setState(userId, AccountAddState.WAITING_API_ID, undefined, {
      messageId: state.messageId,
      newGroupName: folderName,
    });

    const cancelKeyboard = Markup.keyboard([['❌ Отмена']]).oneTime().resize();

    await ctx.reply(
      '✅ <b>Тип группы выбран</b>\n\n' +
      `Группа: <b>${folderName}</b>\n\n` +
      '<b>Как получить API ID и API Hash:</b>\n' +
      '1. Откройте сайт <code>https://my.telegram.org</code> и войдите через свой Telegram.\n' +
      '2. Перейдите в раздел <b>API Development Tools</b>.\n' +
      `3. Создайте приложение с именем <code>anicardautosystem</code>.\n` +
      '4. После создания вы увидите поля <b>App api_id</b> и <b>App api_hash</b>.\n\n' +
      'Отправьте <b>API ID</b> (число, например: 12345678):',
      {
        parse_mode: 'HTML',
        ...cancelKeyboard,
      }
    );

    return true;
  }

  /**
   * Обрабатывает ввод API ID
   */
  async handleApiId(ctx: Context, apiIdText: string): Promise<boolean> {
    if (!ctx.from) {
      return false;
    }

    const userId = ctx.from.id;
    const state = this.stateService.getState(userId);

    if (!state || state.state !== AccountAddState.WAITING_API_ID) {
      return false;
    }

    // Валидация API ID
    const apiId = parseInt(apiIdText.trim(), 10);
    if (isNaN(apiId) || apiId <= 0) {
      await this.sendMessage(ctx, '❌ Неверный формат API ID. Отправьте положительное число (например: 12345678).');
      return true;
    }

    // Сохраняем API ID и переходим к вводу API Hash
    this.stateService.setState(userId, AccountAddState.WAITING_API_HASH, undefined, {
      messageId: state.messageId,
      newGroupName: state.newGroupName,
      apiId,
    });

    const { Markup } = await import('telegraf');
    const cancelKeyboard = Markup.keyboard([['❌ Отмена']]).oneTime().resize();

    const message =
      '✅ <b>API ID сохранен</b>\n\n' +
      `API ID: <b>${apiId}</b>\n\n` +
      'Отправьте сюда <b>API Hash</b> (строка, например: <code>abc123def456ghi789</code>):';

    await ctx.reply(message, {
      parse_mode: 'HTML',
      ...cancelKeyboard,
    });

    return true;
  }

  /**
   * Обрабатывает ввод API Hash и создает группу
   */
  async handleApiHash(ctx: Context, apiHash: string): Promise<boolean> {
    if (!ctx.from) {
      return false;
    }

    const userId = ctx.from.id;
    const state = this.stateService.getState(userId);

    if (!state || state.state !== AccountAddState.WAITING_API_HASH) {
      return false;
    }

    // Проверяем наличие всех данных
    if (!state.newGroupName || !state.apiId || !apiHash || apiHash.trim().length === 0) {
      await this.sendMessage(ctx, '❌ Ошибка: данные потеряны. Начните процесс заново.');
      this.stateService.clearState(userId);
      return true;
    }

    const folderName = state.newGroupName;
    const apiId = state.apiId;
    const cleanApiHash = apiHash.trim();

    // Валидация API Hash (должен быть непустой)
    if (cleanApiHash.length < 10) {
      await this.sendMessage(ctx, '❌ API Hash слишком короткий. Проверьте правильность ввода.');
      return true;
    }

    // Создаем группу с API конфигурацией
    const isMainGroup = folderName === 'main';
    const success = await this.accountManagementService.createGroupWithApi(
      folderName,
      apiId,
      cleanApiHash,
      isMainGroup
    );

    if (success) {
      await this.sendMessage(
        ctx,
        '✅ <b>Группа успешно создана!</b>\n\n' +
        `Группа: <b>${folderName}</b>\n` +
        `API ID: <b>${apiId}</b>\n\n` +
        'Теперь вы можете регистрировать в неё аккаунты.',
        {
          parse_mode: 'HTML',
          reply_markup: { remove_keyboard: true },
        }
      );
    } else {
      await this.sendMessage(
        ctx,
        '❌ <b>Ошибка при создании группы</b>\n\n' +
        'Проверьте логи для деталей.',
        {
          parse_mode: 'HTML',
          reply_markup: { remove_keyboard: true },
        }
      );
    }

    this.stateService.clearState(userId);
    return true;
  }

}