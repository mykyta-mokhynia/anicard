import { executeQuery, selectQuery } from '../db';
import { AccessLevel } from '../types/user';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

/**
 * Интерфейс для отображения аккаунта в списке
 */
export interface AccountDisplayInfo {
  id: number;
  phoneNumber: string;
  folderName: string;
  telegramId: number | null;
  username: string | null;
  isMain: boolean;
  isActive: boolean;
  hasApi: boolean; // Есть ли API конфигурация для папки
  sessionExists: boolean; // Существует ли файл сессии
  subscription?: string; // Тип подписки
  inClan?: boolean; // Находится ли в клане
}

/**
 * Группа аккаунтов (4 аккаунта на группу)
 */
export interface AccountGroup {
  folderName: string;
  accounts: AccountDisplayInfo[];
  hasApi: boolean;
  accountCount: number;
  isMainGroup?: boolean; // Является ли группа main (для сбора карт)
  maxAccounts?: number; // Максимальное количество аккаунтов в группе
}

/**
 * Интерфейс конфигурации для папки
 */
interface FolderConfig {
  apiId: number;
  apiHash: string;
}

/**
 * Сервис для управления Telegram аккаунтами из бота
 */
export class AccountManagementService {
  private baseSessionPath: string;

  constructor() {
    // Путь к папке session относительно корня проекта Anicard
    // Если запускаем из anicard_helper_bot, нужно подняться на уровень выше
    const projectRoot = process.cwd().includes('anicard_helper_bot') 
      ? path.resolve(process.cwd(), '..')
      : process.cwd();
    this.baseSessionPath = path.resolve(projectRoot, 'tg_accounts', 'session');
    console.log(`[AccountManagementService] Base session path: ${this.baseSessionPath}`);
  }

  /**
   * Получает все аккаунты, сгруппированные по папкам (по 4 аккаунта)
   */
  async getAccountGroups(): Promise<AccountGroup[]> {
    // Получаем все аккаунты из БД
    const query = `
      SELECT 
        id,
        phone_number,
        session_path,
        telegram_id,
        username,
        is_main,
        is_active
      FROM telegram_accounts
      ORDER BY session_path, id
    `;

    const accounts = await selectQuery(query, [], true) as any[];

    // Группируем по папкам
    const folderMap = new Map<string, AccountDisplayInfo[]>();

    for (const account of accounts) {
      const folderName = this.extractFolderName(account.sessionPath || account.session_path);
      const hasApi = this.hasFolderApi(folderName);
      const sessionExists = this.sessionExists(
        folderName,
        account.phoneNumber || account.phone_number
      );

      const displayInfo: AccountDisplayInfo = {
        id: account.id,
        phoneNumber: account.phoneNumber || account.phone_number,
        folderName,
        telegramId: account.telegramId || account.telegram_id,
        username: account.username,
        isMain: account.isMain || account.is_main || false,
        isActive: account.isActive !== undefined ? account.isActive : (account.is_active !== undefined ? account.is_active : true),
        hasApi,
        sessionExists,
      };

      if (!folderMap.has(folderName)) {
        folderMap.set(folderName, []);
      }
      folderMap.get(folderName)!.push(displayInfo);
    }

    // Преобразуем в массив групп
    const groups: AccountGroup[] = [];
    for (const [folderName, accountsInFolder] of folderMap.entries()) {
      // Загружаем настройки группы из group.json
      const groupConfig = this.getGroupConfig(folderName);
      const maxAccounts = groupConfig?.settings?.maxAccounts || 4;
      const isMainGroup = groupConfig?.settings?.isMainGroup || folderName === 'main';
      
      // Разбиваем на группы по maxAccounts аккаунтов
      for (let i = 0; i < accountsInFolder.length; i += maxAccounts) {
        const groupAccounts = accountsInFolder.slice(i, i + maxAccounts);
        groups.push({
          folderName,
          accounts: groupAccounts,
          hasApi: this.hasFolderApi(folderName),
          accountCount: groupAccounts.length,
          isMainGroup,
          maxAccounts,
        });
      }
    }

    return groups;
  }

  /**
   * Извлекает название папки из session_path
   */
  extractFolderName(sessionPath: string): string {
    const parts = sessionPath.split('/');
    return parts[0] || 'main';
  }

  /**
   * Получает аккаунт по ID
   */
  async getAccountById(accountId: number): Promise<any | null> {
    const query = `
      SELECT 
        id,
        phone_number,
        session_path,
        telegram_id,
        username,
        is_main,
        is_active,
        subscription,
        battle_coins,
        battle_essence,
        collective_essence,
        tokens,
        in_clan
      FROM telegram_accounts
      WHERE id = ?
    `;

    const result = await selectQuery(query, [accountId], false);
    return result;
  }

  /**
   * Обновляет статус активности аккаунта
   */
  async updateAccountActiveStatus(accountId: number, isActive: boolean, userId: number, userAccessLevel: AccessLevel): Promise<boolean> {
    // Проверяем, является ли аккаунт главным
    const account = await this.getAccountById(accountId);
    if (!account) {
      return false;
    }

    const isMain = account.isMain || account.is_main;
    
    // Если аккаунт главный, только владелец может его редактировать
    if (isMain && userAccessLevel < AccessLevel.OWNER) {
      return false;
    }

    // Обновляем статус
    const query = `
      UPDATE telegram_accounts
      SET is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await executeQuery(query, [isActive, accountId]);
    return true;
  }

  /**
   * Обновляет подписку аккаунта
   */
  async updateAccountSubscription(accountId: number, subscription: 'common' | 'premium' | 'platinum', userId: number, userAccessLevel: AccessLevel): Promise<boolean> {
    const account = await this.getAccountById(accountId);
    if (!account) {
      return false;
    }

    const isMain = account.isMain || account.is_main;
    
    // Если аккаунт главный, только владелец может его редактировать
    if (isMain && userAccessLevel < AccessLevel.OWNER) {
      return false;
    }

    const query = `
      UPDATE telegram_accounts
      SET subscription = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await executeQuery(query, [subscription, accountId]);
    return true;
  }

  /**
   * Обновляет статус "в клане" аккаунта
   */
  async updateAccountInClan(accountId: number, inClan: boolean, userId: number, userAccessLevel: AccessLevel): Promise<boolean> {
    const account = await this.getAccountById(accountId);
    if (!account) {
      return false;
    }

    const isMain = account.isMain || account.is_main;
    
    // Если аккаунт главный, только владелец может его редактировать
    if (isMain && userAccessLevel < AccessLevel.OWNER) {
      return false;
    }

    const query = `
      UPDATE telegram_accounts
      SET in_clan = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await executeQuery(query, [inClan, accountId]);
    return true;
  }

  /**
   * Определяет папку для нового аккаунта (где меньше 4 аккаунтов)
   * Все новые аккаунты идут в twinks_X (main заполняется отдельно через управление)
   * @param userAccessLevel - уровень доступа пользователя (не используется, оставлен для совместимости)
   */
  async determineFolderForNewAccount(userAccessLevel: number = 1): Promise<string> {
    // Все новые аккаунты идут в twinks_X папки
    // main заполняется отдельно через функцию управления аккаунтами
    
    // Ищем первую папку twinks_X с менее чем 4 аккаунтами
    let twinksNumber = 1;
    while (true) {
      const folderName = `twinks_${twinksNumber}`;
      const accounts = await this.getAccountsInFolder(folderName);
      const groupConfig = this.getGroupConfig(folderName);
      const maxAccounts = groupConfig?.settings?.maxAccounts || 4;
      
      if (accounts && accounts.length < maxAccounts) {
        return folderName;
      }
      
      // Если папка заполнена, переходим к следующей
      twinksNumber++;
      
      // Защита от бесконечного цикла
      if (twinksNumber > 1000) {
        throw new Error('Too many twinks folders');
      }
    }
  }


  /**
   * Проверяет, существует ли файл сессии
   */
  private sessionExists(folderName: string, phoneNumber: string): boolean {
    const sessionPath = this.getSessionFilePath(folderName, phoneNumber);
    return fs.existsSync(sessionPath);
  }

  /**
   * Получает путь к файлу сессии
   */
  private getSessionFilePath(folderName: string, phoneNumber: string): string {
    const sanitizedPhone = phoneNumber.replace(/[^0-9]/g, '');
    const fileName = `${sanitizedPhone}.session`;
    return path.join(this.baseSessionPath, folderName, fileName);
  }

  /**
   * Проверяет, есть ли у группы валидный API (строгая проверка, без фолбэков)
   */
  hasFolderApi(folderName: string): boolean {
    return this.getFolderConfig(folderName) !== null;
  }

  /**
   * Загружает конфигурацию для папки из .env файла
   * Возвращает null, если API не настроен для группы (строгая проверка, без фолбэков)
   */
  getFolderConfig(folderName: string): FolderConfig | null {
    const folderPath = path.join(this.baseSessionPath, folderName);
    const groupJsonPath = path.join(folderPath, 'group.json');
    const envPath = path.join(folderPath, '.env');

    // Проверяем group.json
    if (fs.existsSync(groupJsonPath)) {
      try {
        const groupConfig = JSON.parse(fs.readFileSync(groupJsonPath, 'utf-8'));
        
        // Если API отключен для группы, возвращаем null (не используем фолбэк)
        if (groupConfig.api && groupConfig.api.enabled === false) {
          return null;
        }
        
        // Если API включен для группы, загружаем из .env папки
        if (groupConfig.api && groupConfig.api.enabled === true) {
          return this.loadEnvConfig(envPath);
        }
      } catch (error: any) {
        // Игнорируем ошибки парсинга group.json
      }
    }

    // Если group.json нет, пробуем загрузить из .env папки (для обратной совместимости)
    if (fs.existsSync(envPath)) {
      return this.loadEnvConfig(envPath);
    }

    // Если ничего не найдено, возвращаем null (строгая проверка)
    return null;
  }

  /**
   * Загружает конфигурацию из .env файла
   */
  private loadEnvConfig(envPath: string): FolderConfig | null {
    try {
      const envConfig = dotenv.config({ path: envPath, override: false });
      
      if (envConfig.error) {
        return null;
      }

      const apiId = parseInt(envConfig.parsed?.TELEGRAM_API_ID || '0', 10);
      const apiHash = envConfig.parsed?.TELEGRAM_API_HASH || '';

      if (!apiId || !apiHash) {
        return null;
      }

      return { apiId, apiHash };
    } catch (error) {
      return null;
    }
  }

  /**
   * Загружает основной API конфигурацию
   * Ищет в корне tg_accounts, переменных окружения, или в main/.env как резервный вариант
   */
  private getMainApiConfig(): FolderConfig | null {
    // Проверяем переменные окружения
    const envApiId = process.env.TELEGRAM_API_ID;
    const envApiHash = process.env.TELEGRAM_API_HASH;
    
    if (envApiId && envApiHash) {
      const apiId = parseInt(envApiId, 10);
      if (apiId && apiId > 0) {
        return { apiId, apiHash: envApiHash };
      }
    }

    // Пробуем загрузить из корня tg_accounts
    const projectRoot = process.cwd().includes('anicard_helper_bot') 
      ? path.resolve(process.cwd(), '..')
      : process.cwd();
    const mainEnvPath = path.join(projectRoot, 'tg_accounts', '.env');
    
    if (fs.existsSync(mainEnvPath)) {
      const config = this.loadEnvConfig(mainEnvPath);
      if (config) {
        return config;
      }
    }

    // Резервный вариант: используем API из папки main/.env
    const mainFolderEnvPath = path.join(this.baseSessionPath, 'main', '.env');
    if (fs.existsSync(mainFolderEnvPath)) {
      const config = this.loadEnvConfig(mainFolderEnvPath);
      if (config) {
        return config;
      }
    }

    return null;
  }

  /**
   * Загружает конфигурацию группы из group.json
   */
  getGroupConfig(folderName: string): any | null {
    const folderPath = path.join(this.baseSessionPath, folderName);
    const groupJsonPath = path.join(folderPath, 'group.json');

    if (!fs.existsSync(groupJsonPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(groupJsonPath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      console.error(`[AccountManagement] Error loading group.json for ${folderName}:`, error);
      return null;
    }
  }

  /**
   * Получает список всех папок (main, twinks_1, twinks_2, ...)
   */
  async getFolderList(): Promise<string[]> {
    // Используем подзапрос для избежания проблемы с DISTINCT и ORDER BY
    const query = `
      SELECT folder_name
      FROM (
        SELECT DISTINCT 
          SUBSTRING_INDEX(session_path, '/', 1) as folder_name
        FROM telegram_accounts
      ) as folders
      ORDER BY 
        CASE 
          WHEN folder_name = 'main' THEN 0
          ELSE 1
        END,
        folder_name
    `;

    const results = await selectQuery(query, [], true) as any[];
    return results.map(r => r.folder_name || r.folderName || 'main').filter(Boolean);
  }

  /**
   * Получает все аккаунты в папке
   */
  async getAccountsInFolder(folderName: string): Promise<AccountDisplayInfo[]> {
    const query = `
      SELECT 
        id,
        phone_number,
        session_path,
        telegram_id,
        username,
        is_main,
        is_active,
        subscription,
        in_clan
      FROM telegram_accounts
      WHERE session_path LIKE ?
      ORDER BY id
    `;

    const accounts = await selectQuery(query, [`${folderName}/%`], true) as any[];
    const hasApi = this.hasFolderApi(folderName);

    return accounts.map(account => ({
      id: account.id,
      phoneNumber: account.phone_number || account.phoneNumber,
      folderName,
      telegramId: account.telegram_id || account.telegramId,
      username: account.username,
      isMain: account.is_main || account.isMain || false,
      isActive: account.is_active !== undefined ? account.is_active : (account.isActive !== undefined ? account.isActive : true),
      hasApi,
      sessionExists: this.sessionExists(folderName, account.phone_number || account.phoneNumber),
      subscription: account.subscription || 'common',
      inClan: account.in_clan || account.inClan || false,
    }));
  }

  /**
   * Получает список доступных групп для регистрации аккаунтов
   * Возвращает только группы с валидным API и свободными слотами
   */
  async getAvailableGroupsForRegistration(userAccessLevel: AccessLevel): Promise<AccountGroup[]> {
    const allGroups = await this.getAccountGroups();
    const availableGroups: AccountGroup[] = [];

    for (const group of allGroups) {
      // Проверяем, что у группы есть валидный API
      if (!group.hasApi) {
        continue;
      }

      // Проверяем, есть ли свободные слоты
      const maxAccounts = group.maxAccounts || 4;
      if (group.accountCount >= maxAccounts) {
        continue;
      }

      // Проверяем права доступа: main только для OWNER
      if (group.folderName === 'main' && userAccessLevel < AccessLevel.OWNER) {
        continue;
      }

      availableGroups.push(group);
    }

    return availableGroups;
  }

  /**
   * Генерирует следующее доступное имя группы (twinks_X)
   */
  async getNextAvailableGroupName(): Promise<string> {
    const folders = await this.getFolderList();
    let twinksNumber = 1;
    
    while (true) {
      const folderName = `twinks_${twinksNumber}`;
      if (!folders.includes(folderName)) {
        return folderName;
      }
      twinksNumber++;
      
      // Защита от бесконечного цикла
      if (twinksNumber > 1000) {
        throw new Error('Too many twinks folders');
      }
    }
  }

  /**
   * Создает новую группу аккаунтов с API конфигурацией
   * Создает папку, .env файл с API credentials и group.json
   */
  async createGroupWithApi(
    folderName: string,
    apiId: number,
    apiHash: string,
    isMainGroup: boolean = false
  ): Promise<boolean> {
    try {
      const folderPath = path.join(this.baseSessionPath, folderName);
      
      // Создаем папку, если её нет
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      // Создаем .env файл с API credentials
      const envPath = path.join(folderPath, '.env');
      const envContent = `# Telegram API credentials for folder: ${folderName}
# Generated automatically by bot

TELEGRAM_API_ID=${apiId}
TELEGRAM_API_HASH=${apiHash}
`;
      fs.writeFileSync(envPath, envContent);

      // Создаем group.json с настройками
      const groupJsonPath = path.join(folderPath, 'group.json');
      const groupConfig = {
        api: {
          enabled: true,
          useMainApi: false
        },
        settings: {
          maxAccounts: 4,
          description: isMainGroup ? 'Основные аккаунты для сбора карт' : `Группа аккаунтов ${folderName}`,
          isMainGroup: isMainGroup,
          cardCollection: {
            enabled: isMainGroup,
            autoTransfer: isMainGroup
          }
        }
      };
      fs.writeFileSync(groupJsonPath, JSON.stringify(groupConfig, null, 2));

      console.log(`[AccountManagement] ✅ Created group ${folderName} with API configuration`);
      return true;
    } catch (error: any) {
      console.error(`[AccountManagement] ❌ Error creating group ${folderName}:`, error);
      return false;
    }
  }

  /**
   * Проверяет, существует ли группа (папка)
   */
  groupExists(folderName: string): boolean {
    const folderPath = path.join(this.baseSessionPath, folderName);
    return fs.existsSync(folderPath);
  }

  /**
   * Переносит аккаунт в папку main
   */
  async transferAccountToMain(accountId: number): Promise<boolean> {
    const account = await this.getAccountById(accountId);
    if (!account) {
      return false;
    }

    const phoneNumber = account.phone_number || account.phoneNumber;
    const sanitizedPhone = phoneNumber.replace(/[^0-9]/g, '');
    const newSessionPath = `main/${sanitizedPhone}.session`;

    // Пытаемся перенести файл сессии из старой папки в main
    try {
      const oldSessionPathRel = account.session_path || account.sessionPath;
      if (oldSessionPathRel) {
        const oldSessionPath = path.join(this.baseSessionPath, oldSessionPathRel);
        const newSessionFilePath = path.join(this.baseSessionPath, 'main', `${sanitizedPhone}.session`);

        // Создаем папку main, если её нет
        const mainFolderPath = path.join(this.baseSessionPath, 'main');
        if (!fs.existsSync(mainFolderPath)) {
          fs.mkdirSync(mainFolderPath, { recursive: true });
        }

        if (fs.existsSync(oldSessionPath)) {
          fs.renameSync(oldSessionPath, newSessionFilePath);
        }
      }
    } catch (error: any) {
      // Не считаем это критичной ошибкой, просто логируем
      console.error('[AccountManagement] Error moving session file to main:', error);
    }

    const query = `
      UPDATE telegram_accounts
      SET session_path = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await executeQuery(query, [newSessionPath, accountId]);
    return true;
  }
}
