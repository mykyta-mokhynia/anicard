import dotenv from 'dotenv';
import path from 'path';
import { TunnelProvider } from '../utils/tunnel';

// Загружаем .env из родительской директории (Anicard/)
// Определяем путь к родительской директории от текущей рабочей директории
// Если запускаем из anicard_helper_bot/, то идем на уровень вверх
// Если запускаем из корня Anicard/, то .env уже там
const parentEnvPath = path.resolve(process.cwd(), '..', '.env');
const currentEnvPath = path.resolve(process.cwd(), '.env');

// Сначала пробуем загрузить из родительской директории
dotenv.config({ path: parentEnvPath });
// Затем из текущей (если есть, перезапишет значения)
dotenv.config({ path: currentEnvPath });

// Парсим разрешенные группы из переменной окружения
// Формат: ALLOWED_GROUP_IDS=-123456789,-987654321 (можно через запятую или пробел)
function parseAllowedGroupIds(): number[] {
  const envValue = process.env.ALLOWED_GROUP_IDS || '';
  if (!envValue.trim()) {
    return [];
  }
  
  // Поддерживаем разделители: запятая, пробел, точка с запятой
  const ids = envValue
    .split(/[,;\s]+/)
    .map(id => id.trim())
    .filter(id => id.length > 0)
    .map(id => {
      const numId = parseInt(id, 10);
      if (isNaN(numId)) {
        console.warn(`[Config] Invalid group ID in ALLOWED_GROUP_IDS: ${id}`);
        return null;
      }
      return numId;
    })
    .filter((id): id is number => id !== null);
  
  return ids;
}

export const config = {
  botToken: process.env.ANICARD_HELPER_BOT_TOKEN || '',
  ngrokAuthToken: process.env.NGROK_AUTH_TOKEN || '',
  port: parseInt(process.env.PORT || '3000', 10),
  webhookUrl: process.env.WEBHOOK_URL || '',
  tunnelProvider: (process.env.TUNNEL_PROVIDER || 'cloudflare') as TunnelProvider,
  allowedGroupIds: parseAllowedGroupIds(),
  // Database config
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'anicard_bot',
  },
};

// Логируем загруженные разрешенные группы при старте
console.log(`[Config] Loaded ${config.allowedGroupIds.length} allowed group(s):`, config.allowedGroupIds);

if (!config.botToken) {
  throw new Error('ANICARD_HELPER_BOT_TOKEN is required in .env file (should be in parent directory)');
}

// Валидация провайдера туннеля
const validProviders: TunnelProvider[] = ['cloudflare', 'localtunnel', 'bore', 'ngrok'];
if (!validProviders.includes(config.tunnelProvider)) {
  throw new Error(`Invalid TUNNEL_PROVIDER. Must be one of: ${validProviders.join(', ')}`);
}


