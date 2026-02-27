# airways.gg — Project Summary

A public flight tracking and delay prediction platform focused exclusively on **Guernsey Airport (GCI)** and **Aurigny Air Services**.

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
| Scrapers       | Node.js + TypeScript, `puppeteer-real-browser` (Cloudflare bypass), `cheerio` |
| Maps           | Leaflet.js + OpenStreetMap                                                    |
| ML Service     | Python 3.11, FastAPI, scikit-learn (stub — not yet trained)                   |
| Infrastructure | Docker + Docker Compose, npm workspaces monorepo                              |

---

## Services (6 total)

| Service                 | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `apps/web`              | SvelteKit SSR app — the public-facing website                           |
| `apps/aurigny-scraper`  | Scrapes Aurigny's live schedule API every 5–15 min, sleeps overnight    |
| `apps/guernsey-scraper` | One-shot backfill of historical data from airport.gg                    |
| `apps/weather-service`  | Fetches METARs/TAFs from aviationweather.gov every 15 min               |
| `apps/position-service` | Polls FlightRadar24 for live aircraft positions every 5 min             |
| `apps/ml-service`       | Delay prediction API (placeholder — model training not yet implemented) |

All services share a single `packages/database` package (Drizzle schema + client) and communicate exclusively through the shared Postgres database — no message queue or REST layer between services.'

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
  ├── flight_notes       — timestamped operational notes from Aurigny's XML
  ├── flight_status_history — timestamped status messages from Guernsey Airport scraper
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

**Cloudflare bypass**
The Aurigny scraper uses a real Chromium browser (`puppeteer-real-browser`) with mouse/scroll simulation and optional rotating proxies to defeat Turnstile. After the CF challenge resolves, subsequent date fetches reuse the live session cookies via in-page `fetch()` calls — no second browser launch needed.

**Smart adaptive scraping**
Polling intervals scale dynamically based on time-to-next-flight-event:

| Time to next flight event | Interval       |
| ------------------------- | -------------- |
| < 20 min                  | 5 min (high)   |
| 20–60 min                 | 5 min (medium) |
| 60–120 min                | 10 min (low)   |
| > 120 min                 | 15 min (idle)  |

The scraper sleeps after the last flight of the day (hard cutoff 23:00 Guernsey local) and wakes automatically 30 minutes before the first flight of the next day. A background prefetch runs every 8 hours to keep next-day schedule data fresh.

**Dual-source aircraft positioning**
Own DB rotation history first (free, no API quota) → FR24 live API for airborne flights → FR24 historical summary as a last resort.

**Worldwide airport database**
Seeded from the OurAirports open-data CSV (~10k airports), resynced daily. Provides IATA↔ICAO mapping, coordinates, and names across the whole platform.

**Monorepo shared DB package**
`packages/database` is a compiled TypeScript package imported by all Node.js services. Schema types flow directly from Drizzle into SvelteKit components — no duplicate type definitions, no raw SQL strings.
