CREATE OR REPLACE PROCEDURE insert_arrivals (
    _airline varchar(100),
    _location varchar(100),
    _code varchar(100),
    _scheduled_time timestamp with time zone,
    _actual_time timestamp with time zone
)
LANGUAGE SQL
AS $BODY$
    INSERT INTO
        public.arrivals
            (
                airline,
                location,
                code,
                scheduled_time,
                actual_time
            )
        VALUES
            (
                _airline,
                _location,
                _code,
                _scheduled_time,
                _actual_time
            );
$BODY$;
