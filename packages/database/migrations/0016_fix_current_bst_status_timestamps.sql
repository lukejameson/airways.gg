-- Migration 0016: Fix BST-stored On Time status timestamps for the current BST season
--
-- Background:
--   flight_status_history.status_timestamp values for "On Time" messages were
--   being stored as BST wall-clock time (e.g. 13:45) rather than UTC (12:45)
--   for flights in the 2026 BST season (2026-03-29 onwards).
--
--   The write-side fix (correctOnTimeTimestamp in guernsey-scraper) prevents
--   new occurrences, but existing rows need a one-off correction.
--
--   Predicate: On Time rows whose status_timestamp is more than 30 minutes
--   in the future — these are records where a BST wall-clock time was stored
--   in a UTC column, making the timestamp appear 1 hour ahead of reality.

UPDATE flight_status_history
SET status_timestamp = status_timestamp - INTERVAL '1 hour'
WHERE
  flight_date >= '2026-03-29'
  AND status_message ILIKE '%on time%'
  AND status_timestamp > NOW() + INTERVAL '30 minutes';
