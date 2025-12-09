-- Скрипт для очистки дубликатов опросников
-- Оставляет только последний опросник каждого типа для каждой группы за каждый день

USE `anicard_bot`;

-- Удаляем дубликаты, оставляя только последний (по id) опросник каждого типа для каждой группы за каждый день
DELETE p1 FROM polls p1
INNER JOIN (
    SELECT 
        group_id,
        poll_type,
        poll_date,
        MAX(id) as max_id
    FROM polls
    GROUP BY group_id, poll_type, poll_date
    HAVING COUNT(*) > 1
) p2 ON p1.group_id = p2.group_id 
    AND p1.poll_type = p2.poll_type 
    AND p1.poll_date = p2.poll_date
    AND p1.id < p2.max_id;

-- Показываем результат
SELECT 
    'Cleanup completed!' AS status,
    COUNT(*) AS remaining_polls
FROM polls;

-- Показываем оставшиеся опросники
SELECT 
    id,
    group_id,
    topic_id,
    poll_type,
    poll_date,
    created_at
FROM polls
ORDER BY group_id, poll_date, poll_type;

