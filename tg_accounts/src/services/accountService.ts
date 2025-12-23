import { TelegramAccount, SubscriptionType } from '../types/account';
import { executeQuery, selectQuery } from '../db';
import { SessionService } from './sessionService';

/**
 * Упрощенный сервис для управления Telegram аккаунтами
 */
export class AccountService {
  private sessionService: SessionService;

  constructor() {
    this.sessionService = new SessionService();
  }

  /**
   * Извлекает название папки из session_path
   */
  private extractFolderName(sessionPath: string): string {
    // session_path имеет формат: "folder_name/phone.session"
    const parts = sessionPath.split('/');
    return parts[0] || 'main';
  }

  /**
   * Создает новый аккаунт в БД и определяет папку для него
   */
  async createAccount(phoneNumber: string): Promise<number> {
    // Определяем папку для нового аккаунта
    const folderName = this.sessionService.determineFolderForNewAccount();
    
    // Создаем папку, если её нет
    this.sessionService.ensureFolderExists(folderName);
    
    // Получаем относительный путь к сессии
    const sessionPath = this.sessionService.getSessionRelativePath(folderName, phoneNumber);

    const query = `
      INSERT INTO telegram_accounts 
      (phone_number, session_path, subscription, is_main, battle_coins, battle_essence, collective_essence, tokens, in_clan, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await executeQuery(query, [
      phoneNumber,
      sessionPath,
      SubscriptionType.COMMON, // По умолчанию common
      false, // По умолчанию не главный
      0, // battle_coins
      0, // battle_essence
      0, // collective_essence
      0, // tokens
      false, // По умолчанию не в клане
      true, // По умолчанию активен
    ]);

    return (result as any).insertId;
  }

  /**
   * Получает аккаунт по ID
   */
  async getAccount(accountId: number): Promise<TelegramAccount | null> {
    const query = `
      SELECT * FROM telegram_accounts WHERE id = ?
    `;
    const result = await selectQuery(query, [accountId], false);
    return result ? this.mapToAccount(result) : null;
  }

  /**
   * Получает аккаунт по номеру телефона
   */
  async getAccountByPhone(phoneNumber: string): Promise<TelegramAccount | null> {
    const query = `
      SELECT * FROM telegram_accounts WHERE phone_number = ?
    `;
    const result = await selectQuery(query, [phoneNumber], false);
    return result ? this.mapToAccount(result) : null;
  }

  /**
   * Получает все аккаунты в папке (извлекает folder_name из session_path)
   */
  async getAccountsInFolder(folderName: string): Promise<TelegramAccount[]> {
    // Ищем аккаунты, у которых session_path начинается с folder_name/
    const query = `
      SELECT * FROM telegram_accounts 
      WHERE session_path LIKE ? 
      ORDER BY id ASC
    `;
    const results = await selectQuery(query, [`${folderName}/%`], false);
    return Array.isArray(results) ? results.map(r => this.mapToAccount(r)) : [];
  }

  /**
   * Получает все аккаунты
   */
  async getAllAccounts(): Promise<TelegramAccount[]> {
    const query = `
      SELECT * FROM telegram_accounts ORDER BY id ASC
    `;
    const results = await selectQuery(query, [], false);
    return Array.isArray(results) ? results.map(r => this.mapToAccount(r)) : [];
  }

  /**
   * Обновляет информацию об аккаунте после авторизации
   */
  async updateAccountInfo(
    accountId: number,
    accountInfo: {
      telegramId?: number;
      username?: string | null;
      subscription?: SubscriptionType;
      isMain?: boolean;
      battleCoins?: number;
      battleEssence?: number;
      collectiveEssence?: number;
      tokens?: number;
      inClan?: boolean;
    }
  ): Promise<void> {
    const updates: string[] = [];
    const params: any[] = [];

    if (accountInfo.telegramId !== undefined) {
      updates.push('telegram_id = ?');
      params.push(accountInfo.telegramId);
    }
    if (accountInfo.username !== undefined) {
      updates.push('username = ?');
      params.push(accountInfo.username);
    }
    if (accountInfo.subscription !== undefined) {
      updates.push('subscription = ?');
      params.push(accountInfo.subscription);
    }
    if (accountInfo.isMain !== undefined) {
      updates.push('is_main = ?');
      params.push(accountInfo.isMain);
    }
    if (accountInfo.battleCoins !== undefined) {
      updates.push('battle_coins = ?');
      params.push(accountInfo.battleCoins);
    }
    if (accountInfo.battleEssence !== undefined) {
      updates.push('battle_essence = ?');
      params.push(accountInfo.battleEssence);
    }
    if (accountInfo.collectiveEssence !== undefined) {
      updates.push('collective_essence = ?');
      params.push(accountInfo.collectiveEssence);
    }
    if (accountInfo.tokens !== undefined) {
      updates.push('tokens = ?');
      params.push(accountInfo.tokens);
    }
    if (accountInfo.inClan !== undefined) {
      updates.push('in_clan = ?');
      params.push(accountInfo.inClan);
    }

    if (updates.length === 0) return;

    params.push(accountId);

    const query = `
      UPDATE telegram_accounts 
      SET ${updates.join(', ')} 
      WHERE id = ?
    `;
    await executeQuery(query, params);
  }

  /**
   * Обновляет подписку аккаунта
   */
  async updateSubscription(
    accountId: number,
    subscription: SubscriptionType
  ): Promise<void> {
    await this.updateAccountInfo(accountId, { subscription });
  }

  /**
   * Обновляет статус главного аккаунта
   */
  async updateIsMain(
    accountId: number,
    isMain: boolean
  ): Promise<void> {
    await this.updateAccountInfo(accountId, { isMain });
  }

  /**
   * Получает все главные аккаунты
   */
  async getMainAccounts(): Promise<TelegramAccount[]> {
    const query = `
      SELECT * FROM telegram_accounts 
      WHERE is_main = TRUE 
      ORDER BY id ASC
    `;
    const results = await selectQuery(query, [], false);
    return Array.isArray(results) ? results.map(r => this.mapToAccount(r)) : [];
  }

  /**
   * Получает сервис для работы с сессиями
   */
  getSessionService(): SessionService {
    return this.sessionService;
  }

  /**
   * Получает название папки для аккаунта (из session_path)
   */
  getFolderNameForAccount(account: TelegramAccount): string {
    return this.extractFolderName(account.sessionPath);
  }

  /**
   * Маппинг результата БД в объект TelegramAccount
   */
  private mapToAccount(row: any): TelegramAccount {
    return {
      id: row.id,
      phoneNumber: row.phone_number,
      sessionPath: row.session_path,
      telegramId: row.telegram_id,
      username: row.username,
      subscription: (row.subscription || SubscriptionType.COMMON) as SubscriptionType,
      isMain: Boolean(row.is_main),
      battleCoins: row.battle_coins || 0,
      battleEssence: row.battle_essence || 0,
      collectiveEssence: row.collective_essence || 0,
      tokens: row.tokens || 0,
      inClan: Boolean(row.in_clan),
      isActive: row.is_active !== undefined ? Boolean(row.is_active) : true,
    };
  }
}
