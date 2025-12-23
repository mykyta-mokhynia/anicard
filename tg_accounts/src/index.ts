import { initPool } from './db';
import { AccountService } from './services/accountService';
import { LoginService } from './services/loginService';
import { FolderConfigService } from './services/folderConfigService';

/**
 * Главный файл системы авторизации Telegram аккаунтов
 */
async function main() {
  console.log('🚀 Starting AniCard Telegram Accounts Authorization...');

  try {
    // Инициализация базы данных
    initPool();
    console.log('[DB] ✅ Database connection initialized');

    const accountService = new AccountService();
    const loginService = new LoginService();
    const sessionService = accountService.getSessionService();
    const folderConfigService = new FolderConfigService(sessionService);

    // Показываем доступные папки
    console.log('\n📁 Available folders:');
    const folders = sessionService.getAllFolders();
    
    if (folders.length === 0) {
      console.log('  ⚠️ No folders found. Create folders manually or add accounts.');
    } else {
      folders.forEach(folder => {
        const config = folderConfigService.getFolderConfig(folder);
        const sessions = sessionService.getSessionsInFolder(folder);
        const status = config ? '✅' : '⚠️';
        console.log(`  ${status} ${folder}/ (${sessions.length} sessions, ${config ? 'API configured' : 'no .env'})`);
      });
    }

    console.log('\n✅ AniCard Telegram Accounts Authorization ready');
    console.log('\n📝 Usage:');
    console.log('  - Use LoginService.loginAccount(phoneNumber) to authorize an account');
    console.log('  - Use LoginService.loginAccountsInFolder(folderName) to authorize all accounts in a folder');
    console.log('  - Use LoginService.loginAllAccounts() to authorize all accounts');
    console.log('\n💡 Service is running. Press Ctrl+C to stop.');
    
    // Держим процесс запущенным для интеграции с ботом
    // В будущем здесь будет API или другие интерфейсы взаимодействия
    // Используем setInterval для поддержания процесса живым
    setInterval(() => {
      // Просто держим процесс живым, можно добавить периодические проверки
    }, 60000); // Каждую минуту (можно изменить интервал)
  } catch (error: any) {
    console.error('❌ Failed to start:', error);
    process.exit(1);
  }
}

// Обработка завершения процесса
process.once('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

main();
