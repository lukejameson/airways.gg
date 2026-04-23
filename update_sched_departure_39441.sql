docker exec postgres-prod psql -U lukejameson_gg_prod -d airwaysgg -c "
UPDATE flights
SET scheduled_departure = DATE_TRUNC('day', scheduled_departure) + INTERVAL '6 hours 45 minutes'
WHERE id = 39441;
"
