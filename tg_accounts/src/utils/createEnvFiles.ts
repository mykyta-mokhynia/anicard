import { SessionService } from '../services/sessionService';
import { FolderConfigService } from '../services/folderConfigService';

/**
 * Утилита для создания примерных .env файлов для всех папок
 */
export async function createEnvFilesForAllFolders(): Promise<void> {
  const sessionService = new SessionService();
  const folderConfigService = new FolderConfigService(sessionService);

  const folders = sessionService.getAllFolders();

  if (folders.length === 0) {
    console.log('📁 No folders found. Creating main folder...');
    sessionService.ensureFolderExists('main');
    folders.push('main');
  }

  console.log(`\n📝 Creating .env files for ${folders.length} folder(s)...\n`);

  for (const folder of folders) {
    folderConfigService.createExampleEnvFile(folder);
  }

  console.log('\n✅ Done! Please fill in TELEGRAM_API_ID and TELEGRAM_API_HASH in each .env file');
  console.log('   Get your API credentials from: https://my.telegram.org/apps\n');
}

// Если запускается напрямую
if (require.main === module) {
  createEnvFilesForAllFolders()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}

