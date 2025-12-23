/**
 * Состояния процесса добавления аккаунта и создания группы
 */
export enum AccountAddState {
  IDLE = 'idle',
  // Регистрация аккаунта
  WAITING_GROUP_SELECTION = 'waiting_group_selection', // Выбор группы перед регистрацией аккаунта
  WAITING_PHONE = 'waiting_phone',
  WAITING_CODE = 'waiting_code',
  // Создание группы аккаунтов
  WAITING_GROUP_NAME = 'waiting_group_name', // Ввод имени новой группы
  WAITING_API_ID = 'waiting_api_id',
  WAITING_API_HASH = 'waiting_api_hash',
}

/**
 * Данные состояния для добавления аккаунта
 */
export interface AccountAddStateData {
  state: AccountAddState;
  phoneNumber?: string;
  userId: number;
  // ID сообщения для редактирования
  messageId?: number;
  // Расширенные данные для процесса авторизации
  phoneCodeHash?: string;
  sessionId?: string; // ID сессии для Python сервиса
  folderName?: string;
  folderConfig?: {
    apiId: number;
    apiHash: string;
  };
  // Временные данные для настройки API
  apiId?: number;
  // Данные для создания группы
  newGroupName?: string; // Имя новой группы (например, "twinks_1" или "main")
}

/**
 * Сервис для управления состоянием процесса добавления аккаунта
 * Использует статическое хранилище для сохранения состояния между экземплярами
 */
export class AccountAddStateService {
  private static states: Map<number, AccountAddStateData> = new Map();

  /**
   * Устанавливает состояние для пользователя
   */
  setState(userId: number, state: AccountAddState, phoneNumber?: string, data?: Partial<AccountAddStateData>): void {
    const existingState = AccountAddStateService.states.get(userId);
    AccountAddStateService.states.set(userId, {
      ...existingState,
      state,
      phoneNumber,
      userId,
      ...data,
    });
  }

  /**
   * Получает состояние пользователя
   */
  getState(userId: number): AccountAddStateData | null {
    return AccountAddStateService.states.get(userId) || null;
  }

  /**
   * Очищает состояние пользователя
   */
  clearState(userId: number): void {
    AccountAddStateService.states.delete(userId);
  }

  /**
   * Проверяет, находится ли пользователь в процессе добавления аккаунта
   */
  isInProcess(userId: number): boolean {
    const state = this.getState(userId);
    return state !== null && state.state !== AccountAddState.IDLE;
  }
}

