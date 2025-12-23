# AniCard Project

Монорепозиторий для проекта AniCard, содержащий основной бот и систему управления аккаунтами.

## Структура проекта

- `anicard_helper_bot/` - Основной Telegram бот для управления группами
- `tg_accounts/` - Система авторизации и управления Telegram аккаунтами

## Установка

```bash
# Установка всех зависимостей
npm run install:all
```

Или установка по отдельности:
```bash
cd anicard_helper_bot && npm install
cd ../tg_accounts && npm install
```

## Запуск

### Одновременный запуск обоих проектов (рекомендуется)

```bash
# Режим разработки (с автоперезагрузкой)
npm run dev

# Production режим
npm start
```

### Запуск по отдельности

**Бот:**
```bash
cd anicard_helper_bot
npm run dev  # или npm start
```

**Система аккаунтов:**
```bash
cd tg_accounts
npm run dev  # или npm start
```

## Скрипты

- `npm run dev` - Запуск обоих проектов в режиме разработки
- `npm run dev:bot` - Запуск только бота в режиме разработки
- `npm run dev:accounts` - Запуск только системы аккаунтов в режиме разработки
- `npm start` - Запуск обоих проектов в production режиме
- `npm run build` - Сборка обоих проектов
- `npm run install:all` - Установка всех зависимостей

## Конфигурация

### Переменные окружения

Создайте файл `.env` в корне проекта (`Anicard/.env`) с необходимыми переменными:

```env
# Бот
ANICARD_HELPER_BOT_TOKEN=your_bot_token
USE_WEBHOOK=false  # true для webhook, false для polling
PORT=3000  # Только если USE_WEBHOOK=true

# База данных (общая для обоих проектов)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=anicard_bot
```

## Примечания

- Оба проекта используют одну и ту же базу данных `anicard_bot`
- Бот по умолчанию использует polling (не требует порт)
- Если используется webhook (`USE_WEBHOOK=true`), убедитесь, что порт не конфликтует с другими сервисами
- Система аккаунтов (`tg_accounts`) не требует отдельного порта, работает как CLI-приложение

