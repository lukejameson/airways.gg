# airways.gg

Flight tracking platform for Guernsey Airport.

## Overview

Shows live arrivals/departures with ML-powered delay predictions based on weather data and historical flight performance.

## Tech Stack

- **Frontend**: SvelteKit 5 + TypeScript + Tailwind CSS
- **Database**: PostgreSQL + Drizzle ORM
- **Scrapers**:
  - Guernsey Airport (airport.gg): HTTP-based TypeScript scraper
  - FlightRadar24: Flight data scraper
  - ADS-B: Aircraft registration lookup (adsb.lol / airplanes.live)
- **ML Service**: Python FastAPI + scikit-learn
- **Infrastructure**: Docker + Docker Compose

## Project Structure

```
airways.gg/
├── apps/
│   ├── web/                    # SvelteKit frontend
│   ├── guernsey-scraper/       # Airport.gg scraper (live + historical backfill)
│   ├── fr24-scraper/           # FlightRadar24 flight data scraper
│   ├── adsb-service/           # ADS-B aircraft registration lookup
│   ├── position-service/       # FR24 live aircraft position poller
│   ├── weather-service/        # Weather data poller
│   └── ml-service/             # Python ML prediction service
├── packages/
│   └── database/               # Drizzle ORM schema & connection
├── docker-compose.yml
├── .env.example
└── package.json

```

## Quick Start

1. **Install dependencies**:
```bash
npm install
```

2. **Set up environment**:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. **Run database migrations**:
```bash
npm run db:push
```

4. **Start development**:
```bash
npm run dev
```

## Docker Deployment

```bash
# Build and start all services
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Run historical backfill
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile backfill up guernsey-backfill
```

## Environment Variables

See `.env.example` for all required variables.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis/Valkey connection string
- `SESSION_SECRET` - Session encryption key

## Features

- Live departure/arrival board with auto-refresh
- ML delay predictions with confidence levels
- Historical data backfill (5+ years)
- Real-time aircraft position tracking
- Admin panel for monitoring
- Dark/light mode
- Mobile-first responsive design

## License

Private - All rights reserved.
