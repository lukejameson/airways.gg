# delays.gg

Flight delay prediction platform for Guernsey's Aurigny airline.

## Overview

Shows live arrivals/departures with ML-powered delay predictions based on weather data and historical flight performance.

## Tech Stack

- **Frontend**: SvelteKit 5 + TypeScript + Tailwind CSS
- **Database**: PostgreSQL + Drizzle ORM
- **Scrapers**: 
  - Aurigny: puppeteer-real-browser (anti-detection)
  - Guernsey Airport: HTTP-based TypeScript scraper
- **ML Service**: Python FastAPI + scikit-learn
- **Infrastructure**: Docker + Docker Compose

## Project Structure

```
delays.gg/
├── apps/
│   ├── web/                    # SvelteKit frontend
│   ├── aurigny-scraper/        # Live flight scraper (anti-detection)
│   ├── guernsey-scraper/       # Historical data scraper
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
# Terminal 1: Start web app
npm run dev

# Terminal 2: Start scraper
npm run scraper:aurigny
```

## Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# Run historical backfill
docker-compose --profile backfill up guernsey-scraper
```

## Environment Variables

See `.env.example` for all required variables.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis/Valkey connection string
- `SESSION_SECRET` - Session encryption key
- `SCRAPER_INTERVAL_MS` - Scraper run interval (default: 5min)

## Features

- Live departure/arrival board with auto-refresh
- ML delay predictions with confidence levels
- Historical data backfill (5+ years)
- Admin panel for monitoring
- Dark/light mode
- Mobile-first responsive design

## License

Private - All rights reserved.
