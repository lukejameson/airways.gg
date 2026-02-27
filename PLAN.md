# airways.gg - Build Spec

## What It Does
Flight delay prediction platform for Guernsey's Aurigny airline. Shows live arrivals/departures with ML-powered delay predictions based on weather data and 5+ years of historical flight performance. Mobile-first live departure board for locals and tourists (hundreds of daily users).

## Stack
Fixed: SvelteKit5 | TypeScript | PostgreSQL | Drizzle ORM | Docker | GitHub Actions
Added:
- FastAPI (Python ML service)
- scikit-learn/pandas (ML model)
- puppeteer-real-browser (Turnstile-bypassing scraper)
- OpenMeteo API (weather data)
- xml2js (XML parsing)
- Tailwind CSS (custom design, NOT generic AI look)

## Features
1. Live Departure Board: Real-time arrivals/departures with auto-refresh (5min), mobile-optimized
2. Delay Predictions: ML probability % + confidence level + predicted delay minutes
3. Flight Search: Search by flight number, filter arrivals/departures
4. Official Delays: Show actual delay times in hours from Aurigny data
5. Admin Panel: User management, scraper monitoring, ML accuracy metrics, data corrections
6. User Auth System: Full account system (locked to admins for MVP)
7. Dark/Light Mode: Light default, user preference stored
8. Historical Data Backfill: Rescrape 5+ years from Guernsey Airport for status update history

## Data Model

Table: users
- id(uuid, pk), email(varchar, unique), password_hash(varchar), role(enum: admin|user), created_at(timestamp), updated_at(timestamp)
- Indexes: email

Table: sessions
- id(uuid, pk), user_id(uuid, fk:users), token(varchar, unique), expires_at(timestamp), created_at(timestamp)
- Indexes: token, user_id

Table: departures
- id(serial, pk), airline(varchar 100), location(varchar 200), code(varchar 100), scheduled_time(timestamp), actual_time(timestamp), created_at(timestamp)
- Indexes: scheduled_time, airline, airline+scheduled_time, code
- Note: Legacy table, keep for backward compatibility during migration

Table: arrivals
- id(serial, pk), airline(varchar 100), location(varchar 200), code(varchar 100), scheduled_time(timestamp), actual_time(timestamp), created_at(timestamp)
- Indexes: scheduled_time, airline, airline+scheduled_time, code
- Note: Legacy table, keep for backward compatibility during migration

Table: flights
- id(serial, pk), unique_id(varchar, unique), flight_number(varchar), airline_code(varchar), departure_airport(varchar), arrival_airport(varchar), scheduled_departure(timestamp), scheduled_arrival(timestamp), actual_departure(timestamp nullable), actual_arrival(timestamp nullable), status(varchar), canceled(boolean), aircraft_registration(varchar), aircraft_type(varchar), delay_minutes(int nullable), flight_date(date), raw_xml(text), created_at(timestamp), updated_at(timestamp)
- Relations: One-to-many with flight_delays, flight_times, flight_notes, flight_status_history
- Indexes: unique_id, flight_number, flight_date, scheduled_departure, departure_airport, arrival_airport, status
- Note: Primary source of truth from Aurigny XML data

Table: flight_delays
- id(serial, pk), flight_id(int, fk:flights), delay_code(varchar), delay_code2(varchar), minutes(int), created_at(timestamp)
- Indexes: flight_id, delay_code

Table: flight_times
- id(serial, pk), flight_id(int, fk:flights), time_type(varchar), time_value(timestamp), created_at(timestamp)
- Indexes: flight_id, time_type
- Note: Stores EurocontrolEOBT, EstimatedBlockOff, ActualBlockOff, ActualTakeOff, ActualBlockOn, ActualTouchDown

Table: flight_notes
- id(serial, pk), flight_id(int, fk:flights), timestamp(timestamp), note_type(varchar), message(text), created_at(timestamp)
- Indexes: flight_id

Table: flight_status_history
- id(serial, pk), flight_code(varchar), flight_date(date), status_timestamp(timestamp), status_message(text), source(enum: aurigny|guernsey_airport), flight_id(int nullable, fk:flights), created_at(timestamp)
- Relations: Linked to flights via flight_code + flight_date (soft link) and flight_id (hard link when matched)
- Indexes: flight_code, flight_date, status_timestamp, source, flight_id
- Note: Stores timestamped status updates from Guernsey Airport scraper (e.g., "On Time", "Check in open - Flight delayed", "Landed 12:14")

Table: weather_data
- id(serial, pk), airport_code(varchar), timestamp(timestamp), temperature(float), wind_speed(float), wind_direction(int), precipitation(float), visibility(float), cloud_cover(int), pressure(float), weather_code(int), created_at(timestamp)
- Indexes: airport_code, timestamp
- Note: OpenMeteo data for GCI (Guernsey), JER (Jersey), and other Aurigny destinations

Table: delay_predictions
- id(serial, pk), flight_id(int, fk:flights), probability(float), confidence(enum: low|medium|high), predicted_delay_minutes(int), model_version(varchar), features_used(jsonb), created_at(timestamp), expires_at(timestamp)
- Indexes: flight_id, expires_at, created_at

Table: scraper_logs
- id(serial, pk), service(enum: aurigny_live|guernsey_historical), status(enum: success|failure|retry), records_scraped(int), error_message(text nullable), retry_count(int default 0), started_at(timestamp), completed_at(timestamp nullable)
- Indexes: service, status, started_at

Table: ml_model_metrics
- id(serial, pk), model_version(varchar), accuracy(float), precision(float), recall(float), f1_score(float), trained_at(timestamp), training_records(int), features(jsonb)
- Indexes: model_version, trained_at

## API Endpoints

### SvelteKit API Routes
GET /api/flights/today - Get today's flights with predictions, auth optional, params: type(arrivals|departures|all)
GET /api/flights/search - Search by flight number, auth optional, params: q(flight number)
GET /api/flights/:id - Get single flight details with full history, auth optional
GET /api/flights/:id/prediction - Get ML prediction for specific flight, auth optional

POST /api/auth/login - User login, auth none, body: {email, password}
POST /api/auth/logout - User logout, auth required
POST /api/auth/register - Register user (admin only), auth admin, body: {email, password, role}
GET /api/auth/me - Get current user, auth required

GET /api/admin/users - List all users, auth admin, params: page, limit
PATCH /api/admin/users/:id - Update user, auth admin, body: {email, role}
DELETE /api/admin/users/:id - Delete user, auth admin

GET /api/admin/scraper/status - Get scraper health/logs, auth admin
POST /api/admin/scraper/trigger - Manually trigger scraper, auth admin, body: {service}

GET /api/admin/ml/metrics - Get model performance metrics, auth admin
POST /api/admin/ml/retrain - Trigger model retraining, auth admin

GET /api/admin/flights - Advanced flight search/filtering, auth admin, params: date_from, date_to, status, airline
PATCH /api/admin/flights/:id - Manual data correction, auth admin, body: {field updates}

### Python ML Service API (FastAPI)
POST /predict - Generate delay prediction, body: {flight_id, weather_data, flight_features}
POST /predict/batch - Batch predictions for today's flights, body: {flights[]}
GET /health - Service health check
GET /model/info - Get current model version and metrics
POST /model/train - Trigger model retraining, body: {date_from, date_to}

## Pages & Routes

/ - Live departure board, public layout, auth optional
/flights/:id - Flight detail page with prediction breakdown, public layout, auth optional
/search - Flight search interface, public layout, auth optional

/login - Login page, auth layout, auth none
/admin - Admin dashboard overview, admin layout, auth admin
/admin/users - User management, admin layout, auth admin
/admin/scraper - Scraper monitoring and logs, admin layout, auth admin
/admin/ml - ML model metrics and retraining, admin layout, auth admin
/admin/flights - Flight data management, admin layout, auth admin

## Key Components

FlightBoard: Live departure/arrival board, props: {type, flights, autoRefresh}
FlightCard: Individual flight display with delay prediction, props: {flight, prediction, compact}
DelayBadge: Visual delay indicator, props: {probability, confidence, delayMinutes}
FlightSearch: Search input with autocomplete, props: {onSearch, placeholder}
FilterTabs: Arrivals/Departures/All toggle, props: {active, onChange}
PredictionBreakdown: Detailed ML prediction explanation, props: {prediction, features}
ThemeToggle: Dark/light mode switcher, props: {current, onChange}
AdminTable: Reusable data table, props: {columns, data, actions, pagination}
ScraperStatus: Real-time scraper health indicator, props: {logs, service}
MLMetricsChart: Model accuracy visualization, props: {metrics, timeRange}

## Auth Strategy
Type: Session-based with secure httpOnly cookies
Roles: admin (full access), user (read-only, future feature)
Flow: Login → create session → set cookie → validate on protected routes
Password: bcrypt hashing, min 8 chars
Session expiry: 7 days, refresh on activity

## External Integrations

OpenMeteo API: Historical and forecast weather data
- Auth: None (public API)
- Operations: Fetch hourly weather for GCI/JER airports, parameters: temperature, wind_speed, wind_direction, precipitation, visibility, cloud_cover, pressure, weather_code
- Endpoint: https://api.open-meteo.com/v1/forecast
- Rate limit: Handle gracefully, cache aggressively

Aurigny XML API: Live flight data via /api/schedule
- Auth: Turnstile challenge (handled by puppeteer-real-browser)
- Operations: Scrape XML every 5-10min, parse flights, delays, times, notes
- Cloudflare bypass: cf_clearance cookie + Turnstile auto-solve

Guernsey Airport Website: Historical flight status updates
- Auth: None
- Operations: Backfill 5+ years of timestamped status updates for arrivals/departures
- Data format: "21/02/2026 10:12: On Time", "22/02/2026 12:15: Landed 12:14"
- User provides existing scraper code (needs tweaking for update row collection)

## Environment Variables

DATABASE_URL: PostgreSQL connection string
REDIS_URL: Redis connection string
ML_SERVICE_URL: Python ML service endpoint (http://ml-service:8000)
OPENMETEO_API_URL: OpenMeteo API base URL
SESSION_SECRET: Session encryption key
ADMIN_EMAIL: Initial admin account email
ADMIN_PASSWORD: Initial admin account password
NODE_ENV: production|development
SCRAPER_INTERVAL_MS: Scraper run interval (default 300000 = 5min)
SCRAPER_MAX_RETRIES: Max retry attempts before alert (default 3)

## Docker Setup

Services:
1. **app** (SvelteKit)
   - Build: Node 20 alpine
   - Ports: 3000
   - Depends: postgres (external), redis (external), ml-service
   - Volumes: None
   - Env: DATABASE_URL, REDIS_URL, ML_SERVICE_URL, SESSION_SECRET

2. **aurigny-scraper** (Node service)
   - Build: Node 20 with puppeteer dependencies
   - Depends: postgres (external), app
   - Restart: always
   - Env: DATABASE_URL, SCRAPER_INTERVAL_MS, SCRAPER_MAX_RETRIES
   - Command: Run scraper on interval, log to scraper_logs table
   - Note: Uses provided puppeteer-real-browser code with Turnstile auto-solve

3. **guernsey-scraper** (Node service)
   - Build: Node 20
   - Depends: postgres (external)
   - Restart: on-failure
   - Env: DATABASE_URL, BACKFILL_START_DATE, BACKFILL_END_DATE
   - Command: Backfill historical data on-demand or scheduled
   - Note: User provides base scraper code, needs modification to capture status update rows

4. **ml-service** (Python FastAPI)
   - Build: Python 3.11 slim
   - Ports: 8000 (internal only)
   - Depends: postgres (external)
   - Volumes: ./ml-models (persist trained models)
   - Env: DATABASE_URL, MODEL_PATH
   - Command: uvicorn main:app --host 0.0.0.0 --port 8000

Compose file: Single docker-compose.yml for all environments
External services: postgres and redis (already running on host)
Networks: Internal bridge network for service communication

## ML Model Strategy

### Training Data Features
- Flight features: airline, route, aircraft_type, scheduled_time (hour/day_of_week), flight_number
- Weather features: temperature, wind_speed, wind_direction, precipitation, visibility, cloud_cover, pressure, weather_code (at scheduled departure time)
- Historical features: avg_delay_for_route, avg_delay_for_aircraft, avg_delay_for_time_of_day, recent_delays (7d/30d)
- Status history features: count_of_status_updates, time_between_updates, final_delay_minutes

### Target Variable
- delay_minutes: Difference between scheduled and actual departure/arrival
- Binary classification: delayed (>15min) vs on-time
- Regression: Predict exact delay minutes

### Model Approach
- Primary: Random Forest Classifier (delay probability) + Regressor (delay minutes)
- Training: Use flights table + flight_status_history + weather_data
- Validation: Time-based split (train on older data, test on recent)
- Retraining: Weekly or on-demand via admin panel
- Versioning: Store model_version in delay_predictions table

### Prediction Flow
1. Scheduled job (hourly): Pre-compute predictions for next 24h flights → store in delay_predictions
2. Real-time API: On-demand prediction for specific flight (e.g., user searches old flight)
3. Confidence calculation: Based on feature completeness and model uncertainty
4. Expiry: Predictions expire after 6 hours, require refresh

### Model Storage
- Persist trained models as .pkl files in mounted volume
- Track metrics in ml_model_metrics table
- Admin can view accuracy, precision, recall, F1 for each version

## Scraper Architecture

### Aurigny Live Scraper (aurigny-scraper service)
- Interval: Every 5-10 minutes
- Process:
  1. Launch puppeteer-real-browser with Turnstile auto-solve
  2. Navigate to Aurigny arrivals/departures page
  3. Intercept /api/schedule XML response
  4. Parse XML (xml2js)
  5. Upsert flights table (unique_id as key)
  6. Insert flight_delays, flight_times, flight_notes
  7. Calculate delay_minutes from Times
  8. Log to scraper_logs
- Retry logic: 3 attempts with exponential backoff
- Alert: If 3 consecutive failures, log error with status='failure' (admin dashboard shows alert)

### Guernsey Historical Scraper (guernsey-scraper service)
- Mode: Backfill (run once or scheduled for incremental updates)
- Process:
  1. User provides existing scraper code
  2. Modify to capture timestamped status updates (not just final Landed/Airborne)
  3. Parse status messages: "21/02/2026 10:12: On Time" → {flight_code, flight_date, status_timestamp, status_message}
  4. Insert into flight_status_history table with source='guernsey_airport'
  5. Link to flights table via flight_code + flight_date matching
  6. Log to scraper_logs
- Date range: Configurable via env vars (default 2019-01-01 to present)
- Deduplication: Check existing records before insert

## Special Notes

### Data Migration Strategy
- Existing departures/arrivals tables (13K + 1.5K records) remain intact
- New flights table becomes primary source from Aurigny XML
- Historical data from Guernsey Airport backfill populates flight_status_history
- ML model uses combined data from both sources
- Admin can manually link old departures/arrivals to new flights table if needed

### Mobile-First UI Requirements
- Touch-friendly tap targets (min 44px)
- Swipe gestures for filter switching
- Auto-refresh with visual indicator (no page reload)
- Optimistic UI updates
- Skeleton loaders during fetch
- Bottom navigation for mobile (top nav for desktop)
- Sticky search bar
- Pull-to-refresh on flight board

### Design Differentiation
- Custom color palette (NOT default Tailwind blues)
- Unique typography (consider airport/aviation aesthetic without being cliché)
- Micro-interactions on delay predictions (subtle animations)
- Data visualization for prediction confidence (progress rings, not basic bars)
- Glassmorphism or gradient accents (avoid flat corporate look)

### Performance Targets
- Initial page load: <2s on 4G
- Flight board refresh: <500ms
- Search results: <300ms
- ML prediction API: <1s
- Scraper execution: <30s per run

### Error Handling
- Scraper failures: Retry 3x → log → admin alert in dashboard
- ML service down: Show cached predictions with "stale data" warning
- Weather API failure: Use last known data, show warning
- Database connection loss: Queue writes in Redis, replay on reconnect

### Future Considerations (Not MVP)
- User notifications (email/SMS for flight delays)
- Historical flight lookup (beyond today)
- Analytics dashboard (delay trends, route performance)
- Public API for third-party integrations
- Mobile app (PWA first, then native)

---

*Spec complete. Claude Code has everything needed to build this. User will provide Guernsey Airport scraper code for modification.*
