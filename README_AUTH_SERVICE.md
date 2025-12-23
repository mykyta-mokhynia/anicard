# Python Auth Service

Сервис авторизации Telegram аккаунтов через Telethon (работает быстрее и надежнее, чем GramJS).

## Установка

```bash
cd tg_accounts
pip install -r requirements.txt
```

## Запуск

```bash
cd tg_accounts
python auth_service.py
```

Сервис запустится на `http://localhost:5000`

## Использование

Сервис автоматически используется ботом при добавлении аккаунтов. 

### API Endpoints

- `GET /health` - проверка работоспособности
- `POST /auth/send_code` - отправка кода на номер телефона
- `POST /auth/sign_in` - вход с кодом подтверждения
- `POST /auth/cancel` - отмена процесса авторизации

## Конфигурация

API credentials загружаются из `tg_accounts/session/main/.env`:
```
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
```

## Интеграция с ботом

Бот автоматически вызывает Python сервис при добавлении аккаунтов. Убедитесь, что сервис запущен перед использованием функции добавления аккаунтов.

