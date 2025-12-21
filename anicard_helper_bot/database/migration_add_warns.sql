USE `anicard_bot`;

-- Таблица для хранения варнов пользователей
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

-- Таблица для хранения настроек варнов групп
CREATE TABLE IF NOT EXISTS `group_warn_settings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `group_id` BIGINT NOT NULL COMMENT 'ID группы в Telegram',
  `warn_report_group_id` BIGINT COMMENT 'ID группы для отправки отчетов о варнах',
  `warn_report_topic_id` INT COMMENT 'ID темы для отправки отчетов (если используется)',
  `norm_points` INT UNSIGNED DEFAULT 90 COMMENT 'Норма очков за неделю (🔹)',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_group_id` (`group_id`),
  INDEX `idx_group_id` (`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Настройки варнов для групп';

