-- Схема базы данных для AniCard Helper Bot
-- MySQL 8.0+

-- Создание базы данных (если не существует)
CREATE DATABASE IF NOT EXISTS `anicard_bot` 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

-- Использование созданной базы данных
USE `anicard_bot`;

-- Таблица для хранения настроек групп
CREATE TABLE IF NOT EXISTS `group_settings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT NOT NULL COMMENT 'ID группы в Telegram',
  `collection_interval_hours` INT UNSIGNED DEFAULT 2 COMMENT 'Интервал сбора групп в часах',
  `collection_interval_minutes` INT UNSIGNED DEFAULT 0 COMMENT 'Интервал сбора групп в минутах',
  `topics_mode_enabled` BOOLEAN DEFAULT FALSE COMMENT 'Включен ли режим тем',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_group_id` (`group_id`),
  INDEX `idx_group_id` (`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Настройки групп';

-- Таблица для хранения тем (topics) в группах
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

-- Таблица для хранения настроек функционала для каждой темы
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

-- Таблица для хранения опросников
CREATE TABLE IF NOT EXISTS `polls` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT NOT NULL COMMENT 'ID группы в Telegram',
  `topic_id` INT COMMENT 'ID темы (если опросник в теме)',
  `poll_id` VARCHAR(255) NOT NULL COMMENT 'ID опросника в Telegram',
  `poll_type` ENUM('clan_battles', 'demon_battles') NOT NULL COMMENT 'Тип опросника',
  `question` VARCHAR(500) NOT NULL COMMENT 'Вопрос опросника',
  `poll_date` DATE NOT NULL COMMENT 'Дата создания опросника',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_poll_id` (`poll_id`),
  INDEX `idx_group_id` (`group_id`),
  INDEX `idx_topic_id` (`topic_id`),
  INDEX `idx_poll_date` (`poll_date`),
  INDEX `idx_poll_type` (`poll_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Опросники';

-- Таблица для хранения ответов пользователей на опросники
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

-- Таблица для логирования действий бота (опционально, для отладки)
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

-- Событие для автоматического удаления данных старше 60 дней
DELIMITER $$

CREATE EVENT IF NOT EXISTS `cleanup_old_poll_data`
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

