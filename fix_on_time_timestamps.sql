docker exec postgres-prod psql -U lukejameson_gg_prod -d lukejameson_gg_prod -c "
UPDATE flight_status_history
SET status_timestamp = status_timestamp - INTERVAL '1 hour'
WHERE status_message ILIKE '%on time%'
  AND status_timestamp >= NOW() - INTERVAL '20 days'
  AND status_timestamp > CURRENT_TIMESTAMP + INTERVAL '1 hour';
"
