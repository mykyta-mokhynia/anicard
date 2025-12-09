import { AsyncLocalStorage } from 'async_hooks';
import type { PoolConnection } from 'mysql2/promise';

export const dbContext = new AsyncLocalStorage<{ conn: PoolConnection }>();

