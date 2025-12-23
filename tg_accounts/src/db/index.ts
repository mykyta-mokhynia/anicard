import mysql from 'mysql2/promise';
import { config } from '../config/env';

let pool: mysql.Pool | null = null;

export function initPool(): mysql.Pool {
  if (pool) {
    return pool;
  }

  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
  });

  return pool;
}

export async function executeQuery(
  query: string,
  params: any[] = [],
  logQuery: boolean = false
): Promise<any> {
  if (!pool) {
    initPool();
  }

  if (logQuery) {
    console.log('[DB] Executing query:', query);
  }

  try {
    const [results] = await pool!.execute(query, params);
    return results;
  } catch (error: any) {
    console.error('[DB] Query error:', error.message);
    console.error('[DB] Query:', query);
    console.error('[DB] Params:', params);
    throw error;
  }
}

export async function selectQuery(
  query: string,
  params: any[] = [],
  logQuery: boolean = false
): Promise<any> {
  return executeQuery(query, params, logQuery);
}

export function getPool(): mysql.Pool {
  if (!pool) {
    initPool();
  }
  return pool!;
}

