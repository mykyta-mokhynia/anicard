-- Скрипт для исправления дат опросников
-- ВНИМАНИЕ: Используйте этот скрипт для исправления дат в polls и poll_answers
-- Измените дату ниже на нужную

USE `anicard_bot`;

-- Проверяем текущие даты
SELECT 
    'Current polls dates' AS info,
    COUNT(*) AS count,
    poll_date
FROM polls
GROUP BY poll_date
ORDER BY poll_date DESC;

-- Исправляем даты опросников (пример: меняем 2025-12-09 на 2025-12-10)
-- ЗАМЕНИТЕ даты на нужные вам
-- UPDATE polls 
-- SET poll_date = '2025-12-10'
-- WHERE poll_date = '2025-12-09';

-- Исправляем даты в ответах (тоже самое)
-- UPDATE poll_answers 
-- SET poll_date = '2025-12-10'
-- WHERE poll_date = '2025-12-09';

-- Проверяем результат
-- SELECT 
--     'Updated polls dates' AS info,
--     COUNT(*) AS count,
--     poll_date
-- FROM polls
-- GROUP BY poll_date
-- ORDER BY poll_date DESC;

