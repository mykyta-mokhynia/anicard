-- Миграция: Добавление таблицы для отслеживания созывов групп
-- Выполнить для добавления функционала созыва групп

USE `anicard_bot`;

-- Таблица для отслеживания созывов групп
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
  INDEX `idx_battle_type` (`battle_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Созывы групп';

-- Проверка создания таблицы
SELECT 'Migration completed successfully!' AS status;
SELECT COUNT(*) AS group_collection_calls_table_exists FROM information_schema.tables 
WHERE table_schema = 'anicard_bot' AND table_name = 'group_collection_calls';

