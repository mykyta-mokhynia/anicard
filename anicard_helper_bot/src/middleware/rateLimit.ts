import { Context } from 'telegraf';

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
  blockUntil?: number;
}

// Хранилище для rate limiting (в памяти)
// В production можно использовать Redis для распределенной системы
const rateLimitStore = new Map<number, RateLimitEntry>();

// Конфигурация rate limiting
const RATE_LIMIT_CONFIG = {
  // Максимальное количество запросов за окно времени
  maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10),
  // Окно времени в миллисекундах (по умолчанию 1 минута)
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  // Время блокировки при превышении лимита (по умолчанию 5 минут)
  blockDurationMs: parseInt(process.env.RATE_LIMIT_BLOCK_DURATION_MS || '300000', 10),
  // Максимальное количество запросов в секунду (дополнительная защита)
  maxRequestsPerSecond: parseInt(process.env.RATE_LIMIT_PER_SECOND || '3', 10),
};

// Очистка старых записей каждые 10 минут
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now && (!entry.blockUntil || entry.blockUntil < now)) {
      rateLimitStore.delete(userId);
    }
  }
}, 600000); // 10 минут

export async function rateLimit(ctx: Context, next: () => Promise<void>) {
  // Пропускаем обновления без пользователя
  if (!ctx.from) {
    return next();
  }

  // Исключаем ботов из rate limiting (включая самого бота)
  if (ctx.from.is_bot) {
    return next();
  }

  // Пропускаем все сообщения из групп и супергрупп (там много активности)
  if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
    return next();
  }

  const userId = ctx.from.id;
  const now = Date.now();
  let entry = rateLimitStore.get(userId);

  // Инициализация или сброс записи
  if (!entry || entry.resetTime < now) {
    entry = {
      count: 0,
      resetTime: now + RATE_LIMIT_CONFIG.windowMs,
      blocked: false,
    };
    rateLimitStore.set(userId, entry);
  }

  // Проверка блокировки
  if (entry.blocked && entry.blockUntil && entry.blockUntil > now) {
    const remainingSeconds = Math.ceil((entry.blockUntil - now) / 1000);
    console.warn(`[RateLimit] User ${userId} is blocked for ${remainingSeconds} more seconds`);
    
    // Не отправляем сообщение, чтобы не спамить
    return;
  }

  // Сброс блокировки если время истекло
  if (entry.blocked && entry.blockUntil && entry.blockUntil <= now) {
    entry.blocked = false;
    entry.count = 0;
    entry.resetTime = now + RATE_LIMIT_CONFIG.windowMs;
  }

  // Проверка лимита запросов в секунду (дополнительная защита)
  const lastRequestTime = (entry as any).lastRequestTime || 0;
  const timeSinceLastRequest = now - lastRequestTime;
  const minInterval = 1000 / RATE_LIMIT_CONFIG.maxRequestsPerSecond;

  if (timeSinceLastRequest < minInterval && lastRequestTime > 0) {
    console.warn(`[RateLimit] User ${userId} exceeded per-second limit`);
    entry.count += 1;
    (entry as any).lastRequestTime = now;
    
    if (entry.count >= RATE_LIMIT_CONFIG.maxRequests) {
      entry.blocked = true;
      entry.blockUntil = now + RATE_LIMIT_CONFIG.blockDurationMs;
      console.warn(`[RateLimit] User ${userId} blocked for ${RATE_LIMIT_CONFIG.blockDurationMs / 1000} seconds`);
      return;
    }
    return;
  }

  (entry as any).lastRequestTime = now;

  // Увеличиваем счетчик
  entry.count += 1;

  // Проверка превышения лимита
  if (entry.count > RATE_LIMIT_CONFIG.maxRequests) {
    entry.blocked = true;
    entry.blockUntil = now + RATE_LIMIT_CONFIG.blockDurationMs;
    
    console.warn(
      `[RateLimit] User ${userId} exceeded rate limit. ` +
      `Blocked for ${RATE_LIMIT_CONFIG.blockDurationMs / 1000} seconds`
    );
    
    try {
      await ctx.reply(
        `⚠️ Вы превысили лимит запросов. Попробуйте снова через ${Math.ceil(RATE_LIMIT_CONFIG.blockDurationMs / 1000 / 60)} минут.`
      );
    } catch (error) {
      // Игнорируем ошибки отправки сообщений при блокировке
    }
    
    return;
  }

  // Продолжаем выполнение
  return next();
}

