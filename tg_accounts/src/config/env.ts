import dotenv from 'dotenv';
import path from 'path';

// Загружаем .env из родительской директории или текущей
const parentEnvPath = path.resolve(process.cwd(), '..', '.env');
const currentEnvPath = path.resolve(process.cwd(), '.env');

dotenv.config({ path: parentEnvPath });
dotenv.config({ path: currentEnvPath });

export const config = {
  // Database config (используем ту же БД что и основной бот)
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'anicard_bot',
  },
  // Настройки Telegram API
  accounts: {
    apiId: parseInt(process.env.TELEGRAM_API_ID || '0', 10),
    apiHash: process.env.TELEGRAM_API_HASH || '',
  },
};

if (!config.accounts.apiId || !config.accounts.apiHash) {
  console.warn('[Config] ⚠️ TELEGRAM_API_ID or TELEGRAM_API_HASH not set. Account registration will not work.');
}
