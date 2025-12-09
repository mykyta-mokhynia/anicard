-- Исправление: Добавление колонки updated_at в таблицу polls
-- Выполнить если таблица уже создана без этой колонки

USE `anicard_bot`;

-- Проверяем, существует ли колонка updated_at
SET @col_exists = (
  SELECT COUNT(*) 
  FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = 'anicard_bot' 
    AND TABLE_NAME = 'polls' 
    AND COLUMN_NAME = 'updated_at'
);

-- Добавляем колонку только если её нет
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `polls` ADD COLUMN `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`',
  'SELECT "Column updated_at already exists" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Проверка
SELECT 'Migration completed successfully!' AS status;
DESCRIBE `polls`;

