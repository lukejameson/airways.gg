-- Debug departures for Blue Islands
SELECT
    airline,
    location,
    scheduled_time,
    actual_time,
    CASE
        WHEN actual_time > scheduled_time
        THEN EXTRACT(EPOCH FROM (actual_time - scheduled_time)) / 60
        ELSE 0
    END as delay_minutes
FROM departures
WHERE airline = 'Blue Islands'
AND DATE(scheduled_time) >= DATE('2025-07-01')
AND DATE(scheduled_time) <= DATE('2025-07-15')
AND actual_time IS NOT NULL
AND scheduled_time IS NOT NULL
ORDER BY scheduled_time
LIMIT 10;
