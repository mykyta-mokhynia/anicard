import { executeQuery, selectQuery } from '../db';
import { User, AccessLevel } from '../types/user';

/**
 * Создает или обновляет пользователя в таблице users
 * Если пользователь уже существует (по telegram_id), обновляет его данные
 * Если не существует, создает новую запись с access_level = 1 (MEMBER)
 */
export async function upsertUser(
  telegramId: number,
  firstName?: string,
  lastName?: string,
  username?: string,
  accessLevel: AccessLevel = AccessLevel.MEMBER
): Promise<User> {
  // Проверяем, существует ли пользователь
  const existingUser = await getUserByTelegramId(telegramId);
  
  const query = existingUser
    ? `
      UPDATE users 
      SET first_name = ?,
          last_name = ?,
          username = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ?
    `
    : `
      INSERT INTO users 
      (telegram_id, first_name, last_name, username, access_level)
      VALUES (?, ?, ?, ?, ?)
    `;

  if (existingUser) {
    // Обновляем только имя, фамилию и username, не трогаем access_level
    await executeQuery(query, [
      firstName || null,
      lastName || null,
      username || null,
      telegramId,
    ]);
  } else {
    // Создаем нового пользователя с указанным access_level
    await executeQuery(query, [
      telegramId,
      firstName || null,
      lastName || null,
      username || null,
      accessLevel,
    ]);
  }

  // Получаем созданную/обновленную запись
  const user = await getUserByTelegramId(telegramId);
  
  if (!user) {
    throw new Error(`Failed to create/update user with telegram_id: ${telegramId}`);
  }

  return user;
}

/**
 * Получает пользователя по Telegram ID
 */
export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  const query = `
    SELECT 
      id,
      telegram_id,
      first_name,
      last_name,
      username,
      access_level,
      created_at,
      updated_at
    FROM users
    WHERE telegram_id = ?
  `;

  const result = await selectQuery(query, [telegramId], false);

  if (!result) {
    return null;
  }

  return mapToUser(result);
}

/**
 * Получает пользователя по ID в БД
 */
export async function getUserById(id: number): Promise<User | null> {
  const query = `
    SELECT 
      id,
      telegram_id,
      first_name,
      last_name,
      username,
      access_level,
      created_at,
      updated_at
    FROM users
    WHERE id = ?
  `;

  const result = await selectQuery(query, [id], false);

  if (!result) {
    return null;
  }

  return mapToUser(result);
}

/**
 * Обновляет уровень доступа пользователя
 */
export async function updateUserAccessLevel(
  telegramId: number,
  accessLevel: AccessLevel
): Promise<void> {
  const query = `
    UPDATE users
    SET access_level = ?, updated_at = CURRENT_TIMESTAMP
    WHERE telegram_id = ?
  `;

  await executeQuery(query, [accessLevel, telegramId]);
  console.log(`[UserService] ✅ Updated access level for user ${telegramId} to ${accessLevel}`);
}

/**
 * Преобразует результат запроса в объект User
 * Данные приходят в camelCase из-за snakeToCamelObj в selectQuery
 */
function mapToUser(row: any): User {
  // Данные приходят в camelCase (telegramId, firstName, accessLevel и т.д.)
  // Проверяем оба варианта на случай изменений
  const telegramId = row.telegramId || row.telegram_id;
  const firstName = row.firstName || row.first_name;
  const lastName = row.lastName || row.last_name;
  const username = row.username;
  let accessLevel = row.accessLevel !== undefined ? row.accessLevel : row.access_level;
  const createdAt = row.createdAt || row.created_at;
  const updatedAt = row.updatedAt || row.updated_at;

  // Преобразуем accessLevel в число
  if (typeof accessLevel === 'boolean') {
    // Если все еще boolean (старые данные в кеше), преобразуем
    accessLevel = accessLevel ? 1 : 0;
  } else if (typeof accessLevel === 'string') {
    accessLevel = parseInt(accessLevel, 10);
  }

  // Если accessLevel невалидный, используем значение по умолчанию
  if (accessLevel === null || accessLevel === undefined || isNaN(accessLevel)) {
    console.warn(`[UserService] Invalid access_level: ${row.accessLevel || row.access_level}, defaulting to MEMBER`);
    accessLevel = AccessLevel.MEMBER;
  }

  return {
    id: row.id,
    telegramId: telegramId,
    firstName: firstName,
    lastName: lastName,
    username: username,
    accessLevel: accessLevel as AccessLevel,
    createdAt: new Date(createdAt),
    updatedAt: new Date(updatedAt),
  };
}

