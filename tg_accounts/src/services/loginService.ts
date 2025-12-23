import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { AccountService } from './accountService';
import { FolderConfigService } from './folderConfigService';

/**
 * Сервис для входа в Telegram аккаунты
 */
export class LoginService {
  private accountService: AccountService;
  private folderConfigService: FolderConfigService;

  constructor() {
    this.accountService = new AccountService();
    const sessionService = this.accountService.getSessionService();
    this.folderConfigService = new FolderConfigService(sessionService);
  }

  /**
   * Входит в аккаунт (используя существующую сессию или создавая новую)
   */
  async loginAccount(phoneNumber: string): Promise<TelegramClient | null> {
    try {
      // Получаем или создаем аккаунт
      let account = await this.accountService.getAccountByPhone(phoneNumber);
      
      if (!account) {
        console.log(`[LoginService] Account not found in DB, creating new account for ${phoneNumber}`);
        const accountId = await this.accountService.createAccount(phoneNumber);
        account = await this.accountService.getAccount(accountId);
        if (!account) {
          throw new Error('Failed to create account');
        }
      }

      // Проверяем, что phoneNumber установлен (используем переданный параметр, если в account нет)
      const accountPhoneNumber = account.phoneNumber || phoneNumber;
      if (!accountPhoneNumber) {
        throw new Error(`Phone number not set for account ID ${account.id}`);
      }

      const sessionService = this.accountService.getSessionService();
      
      // Извлекаем название папки из session_path
      // Если session_path не установлен, ищем сессию в папках
      // Инициализируем значением по умолчанию, чтобы избежать ошибок TS о возможной неинициализации
      let folderName: string = 'main';
      if (!account.sessionPath) {
        // Ищем сессию во всех папках
        const folders = sessionService.getAllFolders();
        let found = false;
        for (const folder of folders) {
          if (sessionService.sessionExists(folder, accountPhoneNumber)) {
            folderName = folder;
            found = true;
            break;
          }
        }
        if (!found) {
          throw new Error(`Session file not found for ${phoneNumber}. Please authorize the account first.`);
        }
        // folderName уже установлен в цикле выше
      } else {
        folderName = this.accountService.getFolderNameForAccount(account);
      }
      
      // Загружаем сессию
      let sessionString = sessionService.loadSession(folderName, accountPhoneNumber);
      
      // Если сессии нет, создаем пустую
      if (!sessionString) {
        sessionString = '';
      }

      const session = new StringSession(sessionString);
      
      // Получаем конфигурацию для папки
      const folderConfig = this.folderConfigService.getFolderConfig(folderName);
      if (!folderConfig) {
        throw new Error(`API credentials not found for folder: ${folderName}. Please create .env file in ${folderName}/`);
      }
      
      // Создаем клиент с API из папки
      const client = new TelegramClient(session, folderConfig.apiId, folderConfig.apiHash, {
        connectionRetries: 5,
      });

      // Подключаемся
      await client.connect();

      // Проверяем, авторизован ли аккаунт
      if (!await client.checkAuthorization()) {
        console.log(`[LoginService] ⚠️ Account ${phoneNumber} is not authorized. Need to sign in.`);
        await client.disconnect();
        return null;
      }

      // Получаем информацию об аккаунте
      const me = await client.getMe();
      
      // Сохраняем обновленную сессию (для StringSession save() возвращает строку)
      const updatedSession = session.save() as unknown as string;
      sessionService.saveSession(folderName, accountPhoneNumber, updatedSession);

      // Обновляем информацию в БД
      const userId = typeof me.id === 'object' ? (me.id as any).toJSNumber() : me.id;
      await this.accountService.updateAccountInfo(account.id, {
        telegramId: userId,
        username: me.username || null,
      });

      console.log(`[LoginService] ✅ Successfully logged in: ${phoneNumber} (@${me.username || 'no username'})`);
      
      return client;
    } catch (error: any) {
      console.error(`[LoginService] ❌ Error logging in ${phoneNumber}:`, error.message);
      return null;
    }
  }

  /**
   * Входит во все аккаунты в папке
   */
  async loginAccountsInFolder(folderName: string): Promise<TelegramClient[]> {
    const accounts = await this.accountService.getAccountsInFolder(folderName);
    const clients: TelegramClient[] = [];

    for (const account of accounts) {
      const client = await this.loginAccount(account.phoneNumber);
      if (client) {
        clients.push(client);
      }
    }

    return clients;
  }

  /**
   * Входит во все аккаунты
   */
  async loginAllAccounts(): Promise<TelegramClient[]> {
    const accounts = await this.accountService.getAllAccounts();
    const clients: TelegramClient[] = [];

    for (const account of accounts) {
      const client = await this.loginAccount(account.phoneNumber);
      if (client) {
        clients.push(client);
      }
    }

    return clients;
  }
}

