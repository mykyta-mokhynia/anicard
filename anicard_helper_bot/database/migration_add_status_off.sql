USE `anicard_bot`;

-- Добавляем статус 'off' в ENUM для поля status в таблице group_members
-- Просто изменяем ENUM на новый список значений

ALTER TABLE `group_members` 
MODIFY COLUMN `status` ENUM('member', 'left', 'kicked', 'off') NOT NULL DEFAULT 'member';
