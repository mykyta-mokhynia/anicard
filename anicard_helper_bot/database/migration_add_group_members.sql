-- Миграция: Добавление таблицы для хранения участников групп
-- Выполнить для добавления функционала отслеживания участников

USE `anicard_bot`;

-- Таблица для хранения участников групп
CREATE TABLE IF NOT EXISTS `group_members` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT NOT NULL COMMENT 'ID группы в Telegram',
  `user_id` BIGINT NOT NULL COMMENT 'ID пользователя в Telegram',
  `first_name` VARCHAR(255) COMMENT 'Имя пользователя',
  `last_name` VARCHAR(255) COMMENT 'Фамилия пользователя',
  `username` VARCHAR(255) COMMENT 'Username пользователя',
  `status` ENUM('member', 'left', 'kicked') DEFAULT 'member' COMMENT 'Статус участника',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_group_user` (`group_id`, `user_id`),
  INDEX `idx_group_id` (`group_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Участники групп';

-- Проверка создания таблицы
SELECT 'Migration completed successfully!' AS status;
SELECT COUNT(*) AS group_members_table_exists FROM information_schema.tables 
WHERE table_schema = 'anicard_bot' AND table_name = 'group_members';

