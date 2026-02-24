CREATE DATABASE port_delays;

GO
;

-- Arrivals table
CREATE TABLE arrivals (
    id SERIAL PRIMARY KEY,
    airline VARCHAR(100) NOT NULL,
    location VARCHAR(200) NOT NULL,
    code VARCHAR(100) NOT NULL,
    scheduled_time TIMESTAMP NOT NULL,
    actual_time TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Departures table
CREATE TABLE departures (
    id SERIAL PRIMARY KEY,
    airline VARCHAR(100) NOT NULL,
    location VARCHAR(200) NOT NULL,
    code VARCHAR(100) NOT NULL,
    scheduled_time TIMESTAMP NOT NULL,
    actual_time TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX idx_arrivals_scheduled_time ON arrivals (scheduled_time);

CREATE INDEX idx_arrivals_airline ON arrivals (airline);

CREATE INDEX idx_arrivals_code ON arrivals (code);

CREATE INDEX idx_departures_scheduled_time ON departures (scheduled_time);

CREATE INDEX idx_departures_airline ON departures (airline);

CREATE INDEX idx_departures_code ON departures (code);

-- Optional: Combined index for airline delay analysis
CREATE INDEX idx_arrivals_airline_scheduled ON arrivals (airline, scheduled_time);

CREATE INDEX idx_departures_airline_scheduled ON departures (airline, scheduled_time);
