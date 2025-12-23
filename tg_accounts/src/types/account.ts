/**
 * Упрощенные типы для системы управления аккаунтами
 */

export enum SubscriptionType {
  COMMON = 'common',
  PREMIUM = 'premium',
  PLATINUM = 'platinum',
}

export enum CardType {
  FIGHT = 'fight',
  COLLECTIVE = 'collective',
}

export interface TelegramAccount {
  id: number; // ID в БД
  phoneNumber: string; // Номер телефона
  sessionPath: string; // Путь к файлу сессии (относительно session/)
  telegramId: number | null; // Telegram User ID (после авторизации)
  username: string | null; // Username
  subscription: SubscriptionType; // Тип подписки
  isMain: boolean; // Является ли аккаунт главным
  battleCoins: number; // Боевые монеты
  battleEssence: number; // Боевая эссенция
  collectiveEssence: number; // Коллективная эссенция
  tokens: number; // Токены
  inClan: boolean; // Находится ли аккаунт в клане
  isActive: boolean; // Активен ли аккаунт (подключен к системе)
}

export interface AccountCard {
  id: number; // ID в БД
  accountId: number; // ID аккаунта
  cardName: string; // Название карты
  strength: number | null; // Сила карты (только для fight карт, null для collective)
  type: CardType; // Тип карты (fight/collective)
  isUnique: boolean; // Является ли карта уникальной
  isBlocked: boolean; // Заблокирована ли карта
}
