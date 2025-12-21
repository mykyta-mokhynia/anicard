USE `anicard_bot`;

-- Добавляем поле warns_enabled в таблицу group_warn_settings
ALTER TABLE `group_warn_settings` 
ADD COLUMN `warns_enabled` BOOLEAN DEFAULT FALSE COMMENT 'Варны включены' AFTER `norm_points`;

