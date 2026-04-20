CREATE TABLE apns_subscriptions (
  id               SERIAL PRIMARY KEY,
  device_token     TEXT NOT NULL,
  flight_id        INTEGER NOT NULL REFERENCES flights(id),
  flight_code      TEXT NOT NULL,
  flight_date      DATE NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  last_notified_at TIMESTAMPTZ,
  UNIQUE(device_token, flight_id)
);
