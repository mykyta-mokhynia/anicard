/**
 * Типы для работы с пользователями системы
 */

export enum AccessLevel {
  BLOCKED = 0,      // Блокнутый
  MEMBER = 1,       // Участник
  TRADER = 2,       // Трейдер
  MODERATOR = 3,    // Модератор
  DEPUTY = 4,       // Зам
  OWNER = 5,        // Владелец
}

export interface User {
  id: number; // ID в БД
  telegramId: number; // Telegram User ID
  firstName: string | null; // Имя пользователя
  lastName: string | null; // Фамилия пользователя
  username: string | null; // Username
  accessLevel: AccessLevel; // Уровень доступа
  createdAt: Date; // Дата создания
  updatedAt: Date; // Дата обновления
}

