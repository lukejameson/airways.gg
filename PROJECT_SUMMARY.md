# airways.gg — Project Summary

A public flight tracking and delay prediction platform focused on **Guernsey Airport (GCI)**.

---

## What it does

- Live departures/arrivals board, auto-refreshing every 5 minutes
- Per-flight detail pages — scheduled/actual times, delay minutes, status history timeline, aircraft position map, and ML-powered delay probability predictions
- Real-time aircraft position tracking (live via FlightRadar24 for airborne flights, inferred from rotation history for grounded ones)
- Weather at both departure and arrival airports (aviation METARs and TAFs)
- 5+ years of historical flight status data backfilled from Guernsey Airport's website

---

## Tech Stack

| Layer          | Technology                                                                    |
| -------------- | ----------------------------------------------------------------------------- |
| Frontend       | SvelteKit 5 (Svelte 5 runes), TypeScript, Tailwind CSS, Vite                  |
| Database       | PostgreSQL + Drizzle ORM                                                      |
| Scrapers       | Node.js + TypeScript, `cheerio`, HTTP-based                                   |
| Maps           | Leaflet.js + OpenStreetMap                                                    |
| ML Service     | Python 3.11, FastAPI, scikit-learn (stub — not yet trained)                   |
| Infrastructure | Docker + Docker Compose, npm workspaces monorepo                              |

---

## Services (8 total)

| Service                 | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `apps/web`              | SvelteKit SSR app — the public-facing website                           |
| `apps/guernsey-scraper` | Live scraper + one-shot backfill of historical data from airport.gg     |
| `apps/fr24-scraper`     | Scrapes FlightRadar24 for flight data                                   |
| `apps/adsb-service`     | ADS-B aircraft registration lookup (adsb.lol / airplanes.live)          |
| `apps/position-service` | Polls FlightRadar24 for live aircraft positions every 5 min             |
| `apps/weather-service`  | Fetches weather data from OpenMeteo every 15 min                        |
| `apps/ml-service`       | Delay prediction API (placeholder — model training not yet implemented) |
| `apps/notification-service` | Push notification dispatcher                                        |

All services share a single `packages/database` package (Drizzle schema + client) and communicate exclusively through the shared Postgres database — no message queue or REST layer between services.

---

## Architecture

The web app has **no separate API layer** — SvelteKit `+page.server.ts` load functions query Postgres directly via Drizzle. The scrapers and background services all write to the same DB. The ML service is the only inter-service HTTP call (web → ML for predictions).

### Routes

| Route           | Purpose                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------ |
| `/`             | Live departures/arrivals board with tabs, filters, and recently-viewed strip               |
| `/flights/[id]` | Full flight detail — times, weather, map, rotation history, status timeline, ML prediction |
| `/search`       | Dedicated flight search                                                                    |
| `/login`        | Authentication (built in schema, not yet wired to routes)                                  |

---

## Database Schema (key tables)

```
flights (serial pk, unique_id as natural key)
  ├── flight_delays      — IATA delay codes + minutes
  ├── flight_times       — EstimatedBlockOff/On, ActualBlockOff/On, EurocontrolEOBT, etc.
  ├── flight_notes       — timestamped operational notes
  ├── flight_status_history — timestamped status messages from scrapers
  ├── delay_predictions  — ML output: probability, confidence, predicted_delay_minutes
  └── aircraft_positions — lat/lon/altitude/speed/heading/ETA from FR24

weather_data    — per-airport hourly weather (temp, wind, visibility, cloud, QNH)
airports        — seeded from OurAirports CSV; IATA↔ICAO mapping + coordinates
scraper_logs    — run history + scheduler lifecycle events (sleep/wake/prefetch)
ml_model_metrics — model version, accuracy, precision, recall, f1
users / sessions — authentication (built, not yet active in routes)
```

---

## Notable Features

**Dual-source flight data**
Guernsey Airport (airport.gg) provides official schedule and status data. FlightRadar24 provides supplementary flight tracking data. ADS-B services provide aircraft registration lookups.

**Smart adaptive scraping**
Polling intervals scale dynamically based on time-to-next-flight-event:

| Time to next flight event | Interval       |
| ------------------------- | -------------- |
| < 20 min                  | 2 min (high)   |
| 20–60 min                 | 5 min (medium) |
| 60–120 min                | 10 min (low)   |
| > 120 min                 | 15 min (idle)  |

The scrapers sleep after the last flight of the day and wake automatically before the first flight of the next day.

**Dual-source aircraft positioning**
Own DB rotation history first (free, no API quota) → FR24 live API for airborne flights → FR24 historical summary as a last resort.

**Worldwide airport database**
Seeded from the OurAirports open-data CSV (~10k airports), resynced daily. Provides IATA↔ICAO mapping, coordinates, and names across the whole platform.

**Monorepo shared DB package**
`packages/database` is a compiled TypeScript package imported by all Node.js services. Schema types flow directly from Drizzle into SvelteKit components — no duplicate type definitions, no raw SQL strings.
