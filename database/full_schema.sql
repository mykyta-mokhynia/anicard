-- ============================================================================
-- ПОЛНАЯ СХЕМА БАЗЫ ДАННЫХ ДЛЯ ANICARD PROJECT
-- MySQL 8.0+
-- ============================================================================
-- Этот файл содержит полную схему базы данных со всеми таблицами
-- Используйте этот файл для создания базы данных с нуля
-- ============================================================================

-- Создание базы данных (если не существует)
CREATE DATABASE IF NOT EXISTS `anicard_bot` 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

-- Использование созданной базы данных
USE `anicard_bot`;

-- ============================================================================
-- ТАБЛИЦА: users
-- Пользователи системы с уровнями доступа
-- ============================================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `telegram_id` BIGINT NOT NULL COMMENT 'ID пользователя в Telegram',
  `first_name` VARCHAR(255) COMMENT 'Имя пользователя',
  `last_name` VARCHAR(255) COMMENT 'Фамилия пользователя',
  `username` VARCHAR(255) COMMENT 'Username пользователя',
  `access_level` TINYINT UNSIGNED DEFAULT 1 COMMENT 'Уровень доступа: 0-блокнутый, 1-участник, 2-трейдер, 3-модератор, 4-зам, 5-владелец',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_telegram_id` (`telegram_id`),
  INDEX `idx_telegram_id` (`telegram_id`),
  INDEX `idx_access_level` (`access_level`),
  INDEX `idx_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Пользователи системы';

-- ============================================================================
-- ТАБЛИЦА: group_settings
-- Настройки групп (интервалы сбора, режим тем и т.д.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `group_settings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT NOT NULL COMMENT 'ID группы в Telegram',
  `collection_interval_hours` INT UNSIGNED DEFAULT 2 COMMENT 'Интервал сбора групп в часах',
  `collection_interval_minutes` INT UNSIGNED DEFAULT 0 COMMENT 'Интервал сбора групп в минутах',
  `topics_mode_enabled` BOOLEAN DEFAULT FALSE COMMENT 'Включен ли режим тем',
  `timezone` VARCHAR(50) DEFAULT 'Europe/Kiev' COMMENT 'Часовой пояс группы (например, Europe/Kiev)',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_group_id` (`group_id`),
  INDEX `idx_group_id` (`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Настройки групп';

-- ============================================================================
-- ТАБЛИЦА: group_topics
-- Темы (topics) в группах с форумами
-- ============================================================================
CREATE TABLE IF NOT EXISTS `group_topics` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT NOT NULL COMMENT 'ID группы в Telegram',
  `topic_id` INT NOT NULL COMMENT 'ID темы в Telegram',
  `topic_name` VARCHAR(255) NOT NULL COMMENT 'Название темы',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_group_topic` (`group_id`, `topic_id`),
  INDEX `idx_group_id` (`group_id`),
  INDEX `idx_topic_id` (`topic_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Темы в группах';

-- ============================================================================
-- ТАБЛИЦА: topic_features
-- Настройки функционала для каждой темы (опросники, топ, сбор групп)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `topic_features` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT NOT NULL COMMENT 'ID группы в Telegram',
  `topic_id` INT NOT NULL COMMENT 'ID темы в Telegram',
  `feature_polls` BOOLEAN DEFAULT FALSE COMMENT 'Опросники включены',
  `feature_top` BOOLEAN DEFAULT FALSE COMMENT 'Топ включен',
  `feature_group_collection` BOOLEAN DEFAULT FALSE COMMENT 'Сбор групп включен',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_group_topic_feature` (`group_id`, `topic_id`),
  INDEX `idx_group_id` (`group_id`),
  INDEX `idx_topic_id` (`topic_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Настройки функционала для тем';

-- ============================================================================
-- ТАБЛИЦА: polls
-- Опросники (клановые и демонические сражения)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `polls` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT NOT NULL COMMENT 'ID группы в Telegram',
  `topic_id` INT COMMENT 'ID темы (если опросник в теме)',
  `poll_id` VARCHAR(255) NOT NULL COMMENT 'ID опросника в Telegram',
  `poll_type` ENUM('clan_battles', 'demon_battles') NOT NULL COMMENT 'Тип опросника',
  `question` VARCHAR(500) NOT NULL COMMENT 'Вопрос опросника',
  `poll_date` DATE NOT NULL COMMENT 'Дата создания опросника',
  `pinned_message_id` INT COMMENT 'ID закрепленного сообщения polls',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_poll_id` (`poll_id`),
  INDEX `idx_group_id` (`group_id`),
  INDEX `idx_topic_id` (`topic_id`),
  INDEX `idx_poll_date` (`poll_date`),
  INDEX `idx_poll_type` (`poll_type`),
  INDEX `idx_group_poll_date_type` (`group_id`, `poll_date`, `poll_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Опросники';

-- ============================================================================
-- ТАБЛИЦА: poll_answers
-- Ответы пользователей на опросники
-- ============================================================================
CREATE TABLE IF NOT EXISTS `poll_answers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `poll_id` INT UNSIGNED NOT NULL COMMENT 'ID опросника из таблицы polls',
  `user_id` BIGINT NOT NULL COMMENT 'ID пользователя в Telegram',
  `option_ids` JSON NOT NULL COMMENT 'Массив ID выбранных вариантов ответа',
  `poll_date` DATE NOT NULL COMMENT 'Дата опросника (для быстрого поиска)',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_poll_user` (`poll_id`, `user_id`),
  INDEX `idx_poll_id` (`poll_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_poll_date` (`poll_date`),
  FOREIGN KEY (`poll_id`) REFERENCES `polls`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ответы пользователей на опросники';

-- ============================================================================
-- ТАБЛИЦА: group_collection_calls
-- Созывы групп (отслеживание статуса сообщений о сборе)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `group_collection_calls` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT NOT NULL COMMENT 'ID группы в Telegram',
  `topic_id` INT NOT NULL COMMENT 'ID темы в Telegram',
  `battle_type` ENUM('clan_battles', 'demon_battles') NOT NULL COMMENT 'Тип битвы',
  `message_id` BIGINT COMMENT 'ID сообщения в Telegram',
  `status` ENUM('pending', 'collected', 'postponed', 'cancelled') DEFAULT 'pending' COMMENT 'Статус созыва',
  `scheduled_time` DATETIME NOT NULL COMMENT 'Запланированное время созыва',
  `postponed_until` DATETIME COMMENT 'Время переноса (если отложен)',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_group_topic` (`group_id`, `topic_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_scheduled_time` (`scheduled_time`),
  INDEX `idx_battle_type` (`battle_type`),
  INDEX `idx_group_topic_battle` (`group_id`, `topic_id`, `battle_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Созывы групп';

-- ============================================================================
-- ТАБЛИЦА: group_members
-- Участники групп (для отслеживания регистрации и активности)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `group_members` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT NOT NULL COMMENT 'ID группы в Telegram',
  `user_id` BIGINT NOT NULL COMMENT 'ID пользователя в Telegram',
  `first_name` VARCHAR(255) COMMENT 'Имя пользователя',
  `last_name` VARCHAR(255) COMMENT 'Фамилия пользователя',
  `username` VARCHAR(255) COMMENT 'Username пользователя',
  `status` ENUM('member', 'left', 'kicked', 'off') DEFAULT 'member' COMMENT 'Статус участника',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_group_user` (`group_id`, `user_id`),
  INDEX `idx_group_id` (`group_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_group_status` (`group_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Участники групп';

-- ============================================================================
-- ТАБЛИЦА: bot_logs
-- Логирование действий бота (для отладки и мониторинга)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `bot_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT COMMENT 'ID группы',
  `user_id` BIGINT COMMENT 'ID пользователя',
  `action` VARCHAR(100) NOT NULL COMMENT 'Тип действия',
  `message` TEXT COMMENT 'Сообщение/данные',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_group_id` (`group_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_action` (`action`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Логи действий бота';

-- ============================================================================
-- ТАБЛИЦА: user_warns
-- Варны пользователей
-- ============================================================================
CREATE TABLE IF NOT EXISTS `user_warns` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT NOT NULL COMMENT 'ID группы в Telegram',
  `user_id` BIGINT NOT NULL COMMENT 'ID пользователя в Telegram',
  `warn_reason` ENUM('no_kv', 'no_play_2days', 'no_norm') NOT NULL COMMENT 'Причина варна',
  `warn_date` DATE NOT NULL COMMENT 'Дата выдачи варна',
  `warn_period_start` DATE COMMENT 'Начало периода проверки (для no_norm - начало недели)',
  `warn_period_end` DATE COMMENT 'Конец периода проверки (для no_norm - конец недели)',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_group_user` (`group_id`, `user_id`),
  INDEX `idx_group_date` (`group_id`, `warn_date`),
  INDEX `idx_warn_reason` (`warn_reason`),
  INDEX `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Варны пользователей';

-- ============================================================================
-- ТАБЛИЦА: group_warn_settings
-- Настройки варнов для групп
-- ============================================================================
CREATE TABLE IF NOT EXISTS `group_warn_settings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT NOT NULL COMMENT 'ID группы в Telegram',
  `warn_report_group_id` BIGINT COMMENT 'ID группы для отправки отчетов о варнах',
  `warn_report_topic_id` INT COMMENT 'ID темы для отправки отчетов (если используется)',
  `norm_points` INT UNSIGNED DEFAULT 90 COMMENT 'Норма очков за неделю (🔹)',
  `warns_enabled` BOOLEAN DEFAULT FALSE COMMENT 'Варны включены',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_group_id` (`group_id`),
  INDEX `idx_group_id` (`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Настройки варнов для групп';

-- ============================================================================
-- ТАБЛИЦА: callouts
-- Созывы участников
-- ============================================================================
CREATE TABLE IF NOT EXISTS `callouts` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT NOT NULL COMMENT 'ID группы в Telegram',
  `topic_id` INT COMMENT 'ID темы (если созыв в теме)',
  `message_id` INT NOT NULL COMMENT 'ID сообщения с созывом',
  `invited_users` JSON NOT NULL COMMENT 'Список приглашенных пользователей',
  `going_users` JSON NOT NULL COMMENT 'Список пользователей, которые идут',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_group_id` (`group_id`),
  INDEX `idx_topic_id` (`topic_id`),
  INDEX `idx_message_id` (`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Созывы участников';

-- ============================================================================
-- ТАБЛИЦА: telegram_accounts
-- Telegram аккаунты для системы управления аккаунтами
-- ============================================================================
CREATE TABLE IF NOT EXISTS `telegram_accounts` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `phone_number` VARCHAR(20) NOT NULL COMMENT 'Номер телефона',
  `session_path` VARCHAR(500) NOT NULL COMMENT 'Путь к файлу сессии (относительно session/)',
  `telegram_id` BIGINT NULL COMMENT 'Telegram User ID (после авторизации)',
  `username` VARCHAR(255) NULL COMMENT 'Username',
  `subscription` ENUM('common', 'premium', 'platinum') DEFAULT 'common' COMMENT 'Тип подписки',
  `is_main` BOOLEAN DEFAULT FALSE COMMENT 'Является ли аккаунт главным',
  `battle_coins` INT DEFAULT 0 COMMENT 'Боевые монеты',
  `battle_essence` INT DEFAULT 0 COMMENT 'Боевая эссенция',
  `collective_essence` INT DEFAULT 0 COMMENT 'Коллективная эссенция',
  `tokens` INT DEFAULT 0 COMMENT 'Токены',
  `in_clan` BOOLEAN DEFAULT FALSE COMMENT 'Находится ли аккаунт в клане',
  `is_active` BOOLEAN DEFAULT TRUE COMMENT 'Активен ли аккаунт (подключен к системе)',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_phone_number` (`phone_number`),
  UNIQUE KEY `unique_session_path` (`session_path`),
  INDEX `idx_subscription` (`subscription`),
  INDEX `idx_is_main` (`is_main`),
  INDEX `idx_is_active` (`is_active`),
  INDEX `idx_telegram_id` (`telegram_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Telegram аккаунты';

-- ============================================================================
-- ТАБЛИЦА: account_cards
-- Карты, полученные на аккаунтах
-- ============================================================================
CREATE TABLE IF NOT EXISTS `account_cards` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `account_id` INT UNSIGNED NOT NULL COMMENT 'ID аккаунта',
  `card_name` VARCHAR(255) NOT NULL COMMENT 'Название карты',
  `strength` INT NULL COMMENT 'Сила карты (только для fight карт)',
  `type` ENUM('fight', 'collective') NOT NULL COMMENT 'Тип карты',
  `is_unique` BOOLEAN DEFAULT FALSE COMMENT 'Является ли карта уникальной',
  `is_blocked` BOOLEAN DEFAULT FALSE COMMENT 'Заблокирована ли карта',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_account_id` (`account_id`),
  INDEX `idx_card_name` (`card_name`),
  INDEX `idx_type` (`type`),
  INDEX `idx_is_unique` (`is_unique`),
  INDEX `idx_is_blocked` (`is_blocked`),
  FOREIGN KEY (`account_id`) REFERENCES `telegram_accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Карты, полученные на аккаунтах';

-- ============================================================================
-- СОБЫТИЯ (EVENTS)
-- Автоматическая очистка старых данных
-- ============================================================================

-- Включаем планировщик событий MySQL (если не включен)
SET GLOBAL event_scheduler = ON;

-- Удаляем существующее событие, если есть
DELIMITER $$

DROP EVENT IF EXISTS `cleanup_old_poll_data`$$

-- Событие для автоматического удаления данных опросников старше 60 дней
CREATE EVENT `cleanup_old_poll_data`
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_DATE + INTERVAL 1 DAY
DO
BEGIN
  -- Удаляем опросники старше 60 дней
  DELETE FROM `polls` 
  WHERE `poll_date` < DATE_SUB(CURRENT_DATE, INTERVAL 60 DAY);
  
  -- Удаляем ответы старше 60 дней (на случай если опросник уже удален)
  DELETE FROM `poll_answers` 
  WHERE `poll_date` < DATE_SUB(CURRENT_DATE, INTERVAL 60 DAY);
END$$

DELIMITER ;

-- ============================================================================
-- ПРОВЕРКА СОЗДАНИЯ ТАБЛИЦ
-- ============================================================================
SELECT 'Schema creation completed successfully!' AS status;

SELECT 
  table_name,
  table_rows,
  table_comment
FROM information_schema.tables 
WHERE table_schema = 'anicard_bot' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ============================================================================
-- КОНЕЦ СХЕМЫ
-- ============================================================================

