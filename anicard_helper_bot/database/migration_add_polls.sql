-- Миграция: Добавление таблиц для опросников и ответов
-- Выполнить после обновления schema.sql

USE `anicard_bot`;

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

-- Включаем планировщик событий MySQL (если не включен)
SET GLOBAL event_scheduler = ON;

-- Событие для автоматического удаления данных старше 60 дней
DELIMITER $$

DROP EVENT IF EXISTS `cleanup_old_poll_data`$$

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

-- Проверка создания таблиц
SELECT 'Migration completed successfully!' AS status;
SELECT COUNT(*) AS polls_table_exists FROM information_schema.tables 
WHERE table_schema = 'anicard_bot' AND table_name = 'polls';
SELECT COUNT(*) AS poll_answers_table_exists FROM information_schema.tables 
WHERE table_schema = 'anicard_bot' AND table_name = 'poll_answers';

