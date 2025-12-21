-- Миграция: Добавление поля timezone в таблицу group_settings
-- Используется для правильного определения даты при создании опросников

USE `anicard_bot`;

-- Проверяем, существует ли колонка timezone, и добавляем её, если её нет
SET @dbname = DATABASE();
SET @tablename = 'group_settings';
SET @columnname = 'timezone';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(50) DEFAULT ''Europe/Kiev'' COMMENT ''Часовой пояс группы (например, Europe/Kiev)''')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Обновляем существующие записи на часовой пояс по умолчанию, если они NULL
UPDATE `group_settings` 
SET `timezone` = 'Europe/Kiev' 
WHERE `timezone` IS NULL;

-- Проверка
SELECT 'Migration completed successfully!' AS status;
SELECT COUNT(*) AS group_settings_with_timezone FROM `group_settings`;

