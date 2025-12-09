import * as mysql from 'mysql2/promise';
import * as mysqlCore from 'mysql2';
import { config } from '../config/env';
import { dbContext } from './context';
import * as globalUtils from '../utils/global';

// Создаем пул соединений
let pool: mysql.Pool | null = null;

/**
 * Инициализация пула соединений
 */
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
    multipleStatements: true,
    timezone: '+00:00',
    dateStrings: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    typeCast(field: any, next: any) {
      if (field.type === 'TINY') {
        const val = field.string();
        return val === null ? null : val === '1';
      }
      return next();
    },
  });

  return pool;
}

export interface QueryInfo {
  tableName: string;
  query: string;
}

export interface OrderedQuery {
  priorityUpsert: QueryInfo[];
  upsertQueries: QueryInfo[];
  deleteQueries: QueryInfo[];
  lastPriorityUpsert: string;
}

export interface SQLColumn {
  name: string;
  value: any;
}

export interface DeleteCondition {
  columnName: string;
  columnValue: string;
}

export interface ConnectLastInsert {
  fieldName: string;
  variableName: string;
}

export enum WhereConditionType {
  AND = 'AND',
  OR = 'OR',
}

export interface WhereCondition {
  columnName: string;
  operator: string;
  columnValue: any;
  whereConditionType?: WhereConditionType;
  preventStringQuotes?: boolean;
}

export function createOrderedQuery(): OrderedQuery {
  return {
    priorityUpsert: [],
    upsertQueries: [],
    lastPriorityUpsert: '',
    deleteQueries: [],
  };
}

function handleTempId(id: any, debug?: boolean) {
  let tempIdQuery = '';
  if (id) {
    if (isNaN(parseInt(id)) && id.charAt(0) !== '@') {
      tempIdQuery = ` \nSET @${id} = LAST_INSERT_ID(); \n`;
    } else if (debug) {
      console.log('Temp ID not changed');
    }
  }
  return tempIdQuery;
}

type ParamsOrFlag = any[] | boolean | undefined;

export async function executeQuery(
  query: string,
  paramsOrFlag?: ParamsOrFlag,
  maybeReturnArray?: boolean
): Promise<any> {
  let params: any[] = [];
  let returnArray: boolean | undefined;

  if (Array.isArray(paramsOrFlag)) {
    params = paramsOrFlag;
    returnArray = maybeReturnArray;
  } else if (typeof paramsOrFlag === 'boolean') {
    returnArray = paramsOrFlag;
  }

  if (!pool) {
    initPool();
  }

  const context = dbContext.getStore();
  let conn: mysql.PoolConnection | undefined;

  try {
    conn = context?.conn ?? await pool!.getConnection();
  } catch (err) {
    console.error('Failed to get database connection:', err);
    throw new Error('Database connection failed');
  }

  if (!query || query.trim() === '') {
    return [];
  }

  try {
    let result: any;

    if (params.length > 0) {
      const [rows] = await conn.query(query, params);
      result = rows;
    } else {
      const statements = query.split(';').filter((stmt) => stmt.trim() !== '');
      for (const statement of statements) {
        const trimmedStatement = statement.trim();
        if (trimmedStatement) {
          const [stmtResult] = await conn.query(trimmedStatement);
          result = stmtResult;
        }
      }
    }

    if (returnArray != null) {
      if (returnArray === true && !Array.isArray(result)) {
        return [result];
      }

      if (returnArray === false && Array.isArray(result)) {
        return result.length > 0 ? result[0] : null;
      }
    }

    return result;
  } catch (err) {
    console.error('Error running query:', err);
    console.error('Query that failed:', query);
    throw err;
  } finally {
    if (!context && conn) {
      try {
        conn.release();
      } catch (releaseErr) {
        console.error('Error releasing connection:', releaseErr);
      }
    }
  }
}

export async function selectQuery(
  query: string,
  paramsOrFlag?: ParamsOrFlag,
  maybeReturnArray?: boolean
): Promise<any> {
  let params: any[] = [];
  let returnArray: boolean | undefined;

  if (Array.isArray(paramsOrFlag)) {
    params = paramsOrFlag;
    returnArray = maybeReturnArray;
  } else if (typeof paramsOrFlag === 'boolean') {
    returnArray = paramsOrFlag;
  }

  const results = await executeQuery(query, params, returnArray);

  if (Array.isArray(results)) {
    globalUtils.snakeToCamelObjArray(results);
  } else if (results && typeof results === 'object') {
    globalUtils.snakeToCamelObj(results);
  }

  return results;
}

export function dynamicDelete(tableName: string, deleteConditions: DeleteCondition[]) {
  return new Promise(async (resolve, reject) => {
    let query = 'DELETE FROM ' + tableName + ' WHERE ';
    for (let i = 0; i < deleteConditions.length; i++) {
      if (i > 0) {
        query += ' OR ';
      }

      let value = deleteConditions[i].columnValue;

      if (typeof value === 'string') {
        value = mysqlCore.escape(value);
      }

      query += globalUtils.camelToSnake(deleteConditions[i].columnName) + ' = ' + value + ' ';
    }

    executeQuery(query)
      .then(resolve)
      .catch(reject);
  });
}

function generateInsertQuery(tableName: string, sqlColumns: SQLColumn[]) {
  let query = '';

  if (sqlColumns.length > 0) {
    query += '\n\nINSERT INTO ' + tableName + ' (';
    for (let i = 0; i < sqlColumns.length; i++) {
      query += sqlColumns[i].name;
      if (i !== sqlColumns.length - 1) {
        query += ', ';
      }
    }
    query += ')\nVALUES(';
    for (let i = 0; i < sqlColumns.length; i++) {
      const value = determineValue(sqlColumns[i].value, false);
      query += value;
      if (i !== sqlColumns.length - 1) {
        query += ', ';
      } else {
        query += ')\n';
      }
    }
  }

  return query;
}

export function generateUpsertQuery(
  tableName: string,
  sqlColumns: SQLColumn[],
  obj: any,
  debug = false
) {
  let query = '';
  let tempIdQuery = '';

  for (let i = 0; i < sqlColumns.length; i++) {
    if (sqlColumns[i].name === 'id') {
      tempIdQuery = handleTempId(sqlColumns[i].value, debug);

      if (tempIdQuery !== '') {
        sqlColumns[i].value = null;
      }
    } else if (typeof sqlColumns[i].value === 'string' && sqlColumns[i].value.startsWith('temp_id')) {
      sqlColumns[i].value = '@' + sqlColumns[i].value;
      obj[sqlColumns[i].name] = '@' + obj[sqlColumns[i].name];
    }
  }

  query += generateInsertQuery(tableName, sqlColumns);
  query += ' ON DUPLICATE KEY UPDATE ';

  for (let i = 0; i < sqlColumns.length; i++) {
    let value;
    if (sqlColumns[i].name === 'id') {
      value = 'LAST_INSERT_ID(id)';
    } else {
      value = determineValue(sqlColumns[i].value, false);
    }
    query += sqlColumns[i].name + ' = ' + value;
    if (i !== sqlColumns.length - 1) {
      query += ', ';
    }
  }

  query += ';';
  query += tempIdQuery;

  return query;
}

export function determineValue(colVal: any, forceToNumber: boolean) {
  let value: any = colVal == undefined ? null : colVal;

  if (forceToNumber) {
    const coerced = Number(colVal);
    value = isNaN(coerced) ? null : coerced;
  } else if (typeof value === 'string' && value.charAt(0) !== '@') {
    value = mysqlCore.escape(colVal);
  }

  return value;
}

export function concatWhereConditionsToQuery(query: string, whereConditions: WhereCondition[]) {
  for (let i = 0; i < whereConditions.length; i++) {
    const whereCondition = whereConditions[i];

    if (i === 0) {
      query += ' WHERE ';
    } else {
      const whereConditionType = whereCondition.whereConditionType ?? WhereConditionType.AND;
      query += ` ${whereConditionType} `;
    }

    const columnValue =
      typeof whereCondition.columnValue === 'string' && whereCondition.preventStringQuotes !== true
        ? `'${whereCondition.columnValue}'`
        : whereCondition.columnValue;

    query += ` ${whereCondition.columnName} ${whereCondition.operator} ${columnValue} `;
  }
  return query;
}

export { pool };

