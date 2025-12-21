-- Миграция: Добавление таблицы для созывов участников

USE `anicard_bot`;

-- Создаем таблицу для хранения данных созывов
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

SELECT 'Migration completed successfully!' AS status;
