# AniCard Telegram Accounts Authorization

Система авторизации Telegram аккаунтов для игрового бота.

## Структура папок

Аккаунты автоматически распределяются по папкам:

- `session/main/` - первые 4 основных аккаунта
- `session/twinks_1/` - следующие 4 аккаунта
- `session/twinks_2/` - следующие 4 аккаунта
- и так далее...

Каждая папка содержит максимум 4 аккаунта. Файлы сессий хранятся в формате `{phone_number}.session`.

**Важно:** Каждая папка должна иметь свой `.env` файл с API credentials:
- `session/main/.env` - для аккаунтов в папке main
- `session/twinks_1/.env` - для аккаунтов в папке twinks_1
- и так далее...

Это позволяет использовать разные API для разных папок.

## Установка

1. Установите зависимости:
```bash
npm install
```

2. Настройте `.env` файл для базы данных (в родительской директории `Anicard/`):
```env
# Database (используется та же БД что и для основного бота)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=anicard_bot
```

3. Создайте `.env` файлы для каждой папки с аккаунтами:
```bash
npm run create-env
```

Это создаст примерные `.env` файлы во всех папках. Затем заполните их своими API credentials:
```env
# session/main/.env (и для других папок)
TELEGRAM_API_ID=your_api_id_here
TELEGRAM_API_HASH=your_api_hash_here
```

Получить API credentials можно на: https://my.telegram.org/apps

4. Создайте базу данных:
```bash
mysql -u root -p < database/schema.sql
```

5. Соберите проект:
```bash
npm run build
```

6. Запустите:
```bash
npm start
```

Или в режиме разработки:
```bash
npm run dev
```

## Использование

### Авторизация аккаунта

```typescript
import { LoginService } from './services/loginService';

const loginService = new LoginService();

// Авторизация одного аккаунта
const client = await loginService.loginAccount('+1234567890');

if (client) {
  // Аккаунт успешно авторизован
  const me = await client.getMe();
  console.log(`Authorized as: @${me.username}`);
  
  // Используйте client для работы с Telegram API
  // ...
  
  // Не забудьте отключиться после использования
  await client.disconnect();
}
```

### Авторизация всех аккаунтов в папке

```typescript
// Авторизация всех аккаунтов в папке main
const clients = await loginService.loginAccountsInFolder('main');

// Работа с клиентами
for (const client of clients) {
  const me = await client.getMe();
  console.log(`Authorized: @${me.username}`);
  // ...
  await client.disconnect();
}
```

### Авторизация всех аккаунтов

```typescript
// Авторизация всех аккаунтов
const allClients = await loginService.loginAllAccounts();

// Работа с клиентами
for (const client of allClients) {
  const me = await client.getMe();
  console.log(`Authorized: @${me.username}`);
  // ...
  await client.disconnect();
}
```

### Работа с аккаунтами

```typescript
import { AccountService } from './services/accountService';

const accountService = new AccountService();

// Получить все аккаунты
const accounts = await accountService.getAllAccounts();

// Получить аккаунты в папке
const mainAccounts = await accountService.getAccountsInFolder('main');

// Получить аккаунт по номеру телефона
const account = await accountService.getAccountByPhone('+1234567890');
```

## База данных

### Таблицы

- `telegram_accounts` - информация об аккаунтах (номер телефона, путь к сессии, папка, статус)
- `account_cards` - карты, которые выбили на аккаунтах (для будущего использования)

## Структура проекта

```
tg_accounts/
├── src/
│   ├── config/
│   │   └── env.ts              # Конфигурация БД
│   ├── db/
│   │   └── index.ts            # Подключение к БД
│   ├── services/
│   │   ├── accountService.ts           # Управление аккаунтами
│   │   ├── sessionService.ts           # Управление папками и сессиями
│   │   ├── folderConfigService.ts      # Загрузка .env из папок
│   │   └── loginService.ts              # Авторизация аккаунтов
│   ├── types/
│   │   └── account.ts          # Типы данных
│   └── index.ts                # Главный файл
├── session/
│   ├── main/                   # Основные аккаунты (до 4)
│   │   ├── .env               # API credentials для этой папки
│   │   └── *.session          # Файлы сессий
│   ├── twinks_1/              # Следующие аккаунты (до 4)
│   │   ├── .env
│   │   └── *.session
│   └── twinks_2/              # И так далее...
├── database/
│   └── schema.sql              # Схема БД
├── package.json
└── tsconfig.json
```

## Примечания

- Сессии аккаунтов хранятся в папке `session/` в соответствующих подпапках
- Каждая папка может содержать максимум 4 аккаунта
- Система автоматически определяет, в какую папку поместить новый аккаунт
- Каждая папка использует свой API (из .env файла)
- После авторизации сессия сохраняется автоматически

## Интеграция с ботом

Система готова к интеграции с основным ботом `anicard_helper_bot`. Используйте `LoginService` для авторизации аккаунтов и получения `TelegramClient` для работы с Telegram API.
