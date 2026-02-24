CREATE OR REPLACE FUNCTION public.check_departures_data(p_start timestamp without time zone, p_end timestamp without time zone)
 RETURNS boolean
 LANGUAGE sql
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM departures
     WHERE DATE(scheduled_time) >= DATE(p_start)
        AND DATE(scheduled_time) <= DATE(p_end)
  );
$function$
