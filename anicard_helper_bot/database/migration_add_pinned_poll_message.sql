-- Миграция: Добавление колонки для хранения ID закрепленного сообщения polls

USE `anicard_bot`;

-- Добавляем колонку pinned_message_id в таблицу polls
-- Используем динамический SQL для проверки существования колонки
SET @dbname = DATABASE();
SET @tablename = 'polls';
SET @columnname = 'pinned_message_id';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `', @columnname, '` INT COMMENT \'ID закрепленного сообщения polls\' AFTER `poll_date`')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SELECT 'Migration completed successfully!' AS status;

