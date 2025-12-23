import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { SessionService } from './sessionService';

/**
 * Интерфейс конфигурации для папки
 */
export interface FolderConfig {
  apiId: number;
  apiHash: string;
}

/**
 * Сервис для загрузки конфигурации из .env файлов папок
 */
export class FolderConfigService {
  private sessionService: SessionService;
  private configCache: Map<string, FolderConfig> = new Map();

  constructor(sessionService: SessionService) {
    this.sessionService = sessionService;
  }

  /**
   * Загружает конфигурацию для папки из .env файла
   * Все папки (включая main) используют TELEGRAM_API_ID и TELEGRAM_API_HASH из .env файла в папке
   */
  getFolderConfig(folderName: string): FolderConfig | null {
    // Проверяем кэш
    if (this.configCache.has(folderName)) {
      return this.configCache.get(folderName)!;
    }


    // Для остальных папок загружаем из .env файла
    const folderPath = this.sessionService.getFolderPath(folderName);
    const envPath = path.join(folderPath, '.env');

    if (!fs.existsSync(envPath)) {
      console.warn(`[FolderConfig] ⚠️ .env file not found for folder: ${folderName}`);
      return null;
    }

    try {
      // Загружаем .env из папки (override: false, чтобы не перезаписывать process.env)
      const envConfig = dotenv.config({ path: envPath, override: false });
      
      if (envConfig.error) {
        console.error(`[FolderConfig] ❌ Error loading .env for ${folderName}:`, envConfig.error);
        return null;
      }

      // Используем только значения из файла .env папки
      const apiId = parseInt(envConfig.parsed?.TELEGRAM_API_ID || '0', 10);
      const apiHash = envConfig.parsed?.TELEGRAM_API_HASH || '';

      if (!apiId || !apiHash) {
        console.warn(`[FolderConfig] ⚠️ TELEGRAM_API_ID or TELEGRAM_API_HASH not set in ${folderName}/.env`);
        return null;
      }

      const config: FolderConfig = {
        apiId,
        apiHash,
      };

      // Кэшируем конфигурацию
      this.configCache.set(folderName, config);

      return config;
    } catch (error: any) {
      console.error(`[FolderConfig] ❌ Error parsing .env for ${folderName}:`, error);
      return null;
    }
  }

  /**
   * Создает пример .env файла для папки
   */
  createExampleEnvFile(folderName: string): void {
    const folderPath = this.sessionService.getFolderPath(folderName);
    this.sessionService.ensureFolderExists(folderName);
    
    const envPath = path.join(folderPath, '.env');
    const exampleContent = `# Telegram API credentials for folder: ${folderName}
# Get your API credentials from https://my.telegram.org/apps

TELEGRAM_API_ID=your_api_id_here
TELEGRAM_API_HASH=your_api_hash_here
`;

    if (!fs.existsSync(envPath)) {
      fs.writeFileSync(envPath, exampleContent);
      console.log(`[FolderConfig] ✅ Created example .env file: ${envPath}`);
    } else {
      console.log(`[FolderConfig] ⚠️ .env file already exists: ${envPath}`);
    }
  }

  /**
   * Очищает кэш конфигураций
   */
  clearCache(): void {
    this.configCache.clear();
  }

  /**
   * Очищает кэш для конкретной папки
   */
  clearCacheForFolder(folderName: string): void {
    this.configCache.delete(folderName);
  }
}

