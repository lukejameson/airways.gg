# ML Model Plan — Delay Predictions

## Current State

### What exists:
- **ML service**: Placeholder only — FastAPI scaffolding with hardcoded responses, no actual ML logic (`apps/ml-service/main.py`)
- **Flight data**: Potentially 100K+ flights from Guernsey backfill (2019-present), plus live Aurigny XML data
- **Weather data**: Only 2 days of forecast data — **no historical weather**
- **Status history**: Scraper works, data available in `flight_status_history`
- **Schema**: `delay_predictions` and `ml_model_metrics` tables ready in the database
- **Docker**: ml-service is in docker-compose.yml with a `ml-models` volume, but does nothing

### Critical gaps:
1. No historical weather data (biggest blocker — can't train without it)
2. No feature engineering pipeline
3. No model training or prediction logic
4. No DB connection in the Python service
5. No prediction scheduler

---

## Available Training Data

### flights table
| Field | ML Use | Notes |
|---|---|---|
| flight_number | Categorical feature | e.g. "GR671" |
| airline_code | Categorical feature | e.g. "GR" |
| departure_airport | Categorical feature | IATA code |
| arrival_airport | Categorical feature | IATA code |
| scheduled_departure | Extract: hour, day_of_week, month, is_weekend | |
| scheduled_arrival | Extract: hour | |
| aircraft_type | Categorical feature | NULL for Guernsey historical (~90% of data) |
| aircraft_registration | Categorical feature | NULL for Guernsey historical |
| delay_minutes | **Target variable** | Computed from actuals vs scheduled |
| actual_departure / actual_arrival | Alternative target computation | |
| canceled | Boolean feature | |
| flight_date | Extract: day_of_year, is_holiday, season | |

### weather_data table (needs historical backfill)
| Field | ML Use |
|---|---|
| temperature | Real, Celsius |
| wind_speed | Real, mph |
| wind_direction | Integer, degrees |
| precipitation | Real, mm |
| visibility | Real, km |
| cloud_cover | Integer, percentage |
| pressure | Real, hPa |
| weather_code | Integer, WMO code (0=clear, 45-48=fog, 61-65=rain, etc.) |

**Available for both departure AND arrival airports = up to 16 weather features per flight.**

Airports tracked: GCI, JER, LGW, LCY, MAN, BRS, BHX, SOU, ACI, CDG

### flight_delays table (Aurigny XML only)
- IATA delay codes + minutes per code
- Only available for live-scraped flights, not historical

### flight_times table (Aurigny XML only)
- Milestones: EurocontrolEOBT, EstimatedBlockOff, ActualBlockOff, ActualTakeOff, ActualBlockOn, ActualTouchDown
- Time deltas between milestones are useful features

### flight_status_history table
- Timestamped status messages: "On Time", "Delayed To 10:40", "Landed 12:14", etc.
- Useful features: count of updates, time between updates, keyword detection

### Derived/Engineered Features (to be computed)
- `avg_delay_for_route` — historical average delay for this departure-arrival pair
- `avg_delay_for_aircraft` — by aircraft_registration
- `avg_delay_for_time_of_day` — hour bucket
- `recent_delays_7d` — rolling 7-day delay average for this route
- `recent_delays_30d` — rolling 30-day delay average

### Data Volume Estimates
- ~700-860 departure flights/month (from 2024 stats)
- ~1,400-1,700 total flights/month (departures + arrivals)
- 7 years of Guernsey backfill = ~100K-120K flight records
- Each flight has 1-5 status updates = ~200K-600K status history records
- 2024 delay rate: **~69% of departures delayed**

---

## Implementation Phases

### Phase 1: Historical Weather Backfill
OpenMeteo has a free historical weather API: `https://archive-api.open-meteo.com/v1/archive`

**Task:** Build `backfill_weather.py` in the ML service (or weather service):
- Fetch hourly weather for all 10 airports from 2019-01-01 to present
- Same parameters as the live weather service: temperature_2m, wind_speed_10m, wind_direction_10m, precipitation, visibility, cloud_cover, surface_pressure, weather_code
- Store in existing `weather_data` table (same schema)
- Rate limit: ~10,000 requests/day on free tier
- 7 years x 10 airports = ~25,500 requests = ~3 days of API calls
- Batch by date ranges (OpenMeteo supports multi-day queries) to reduce request count

### Phase 2: Feature Engineering Pipeline
Build in Python (`apps/ml-service/`):

**Flight features:**
- One-hot encode: route (dep→arr pair), airline_code
- Cyclical encode: hour_of_day (sin/cos), day_of_week, month
- Binary: is_weekend, is_holiday (UK bank holidays + Guernsey Liberation Day)
- Ordinal: season (spring/summer/autumn/winter)

**Weather features (16 total):**
- 8 fields x 2 airports (departure + arrival)
- Join on: airport_code + nearest hour to scheduled_departure/arrival
- Handle missing: fill with median or route-specific averages

**Historical features (rolling aggregates):**
- avg_delay_for_route: mean delay_minutes for this dep→arr pair over past 30d
- avg_delay_for_time: mean delay for this hour bucket over past 30d
- avg_delay_for_aircraft: mean delay for this registration over past 30d (when available)
- recent_delays_7d: flight's route average delay over past 7 days
- recent_delays_30d: same for 30 days
- delay_rate_route: percentage of flights delayed >15min for this route

**Status history features:**
- count_status_updates: number of status messages
- has_delayed_keyword: boolean
- has_cancelled_keyword: boolean
- time_spread: seconds between first and last update

**Handle missing data:**
- aircraft_type and aircraft_registration are NULL for ~90% of historical data
- Treat as a category "unknown" for encoding
- Or: build model without these features and add them as bonus features for live predictions

### Phase 3: Model Training

**Target variables:**
1. **Binary classifier**: `is_delayed` = (delay_minutes > 15)
2. **Regressor**: `delay_minutes` (continuous)

**Model choice:** Random Forest (per PLAN.md)
- `RandomForestClassifier(n_estimators=200, max_depth=20, random_state=42)`
- `RandomForestRegressor(n_estimators=200, max_depth=20, random_state=42)`

**Train/test split:**
- Time-based: train on all data before 2025-01-01, test on 2025-01-01+
- This prevents data leakage from future information

**Evaluation metrics:**
- Classifier: accuracy, precision, recall, F1, ROC AUC
- Regressor: MAE, RMSE, R²
- Store in `ml_model_metrics` table

**Model storage:**
- Serialize as `.pkl` to `/app/models/` (Docker volume `ml-models`)
- Filename: `classifier_v{version}.pkl`, `regressor_v{version}.pkl`
- Track version in `ml_model_metrics.model_version`

### Phase 4: Prediction API + Scheduler

**Wire up real endpoints in `main.py`:**
- `POST /predict`: Load model, extract features for given flight_id, return probability + confidence + predicted_delay_minutes
- `POST /predict/batch`: Same for multiple flights
- `POST /model/train`: Actually trigger training pipeline with date range params
- `GET /model/info`: Return real model version, metrics, feature importance

**Confidence calculation:**
- High: all features available (weather + historical + flight details)
- Medium: weather available but some historical features missing
- Low: limited features available (e.g. new route, no weather)

**Prediction scheduler:**
- Hourly job (cron or setInterval in a Node service)
- Query flights scheduled in next 24 hours
- Call `/predict/batch` for all of them
- Store results in `delay_predictions` table
- Set `expires_at` to now + 6 hours

### Phase 5: Surface Predictions in the UI

**FlightCard (homepage):**
- Show delay probability as a small percentage badge
- Color: green (<30%), amber (30-70%), red (>70%)
- Only show when confidence is medium or high

**Flight Detail Page:**
- Prediction breakdown card showing:
  - Delay probability percentage with progress ring
  - Predicted delay minutes
  - Confidence level (low/medium/high)
  - Top contributing features (from Random Forest feature_importances_)
- Historical accuracy for this route

**Admin ML Dashboard (future):**
- Model accuracy over time
- Feature importance chart
- Retraining trigger
- Prediction accuracy vs actual delays

---

## Key Considerations

### Data Quality Issues
1. **Guernsey scraper scheduled_arrival is estimated** as scheduled_departure + 1 hour — inaccurate for short routes (GCI-JER ~15min) vs long routes (GCI-LGW ~1h). This affects arrival delay calculations.
2. **No IATA delay codes for historical data** — only available from Aurigny XML (live). Historical delay_minutes is computed from timestamps only.
3. **High baseline delay rate (~69%)** — the model must beat this naive baseline to be useful. A model that always predicts "delayed" would be 69% accurate.

### Feature Importance Expectations (based on aviation domain knowledge)
1. **Weather** (especially visibility, wind, precipitation at GCI) — Guernsey is fog-prone
2. **Time of day** — early morning flights often delayed due to overnight fog
3. **Route** — some routes are more delay-prone (longer = more exposure to downstream delays)
4. **Season/month** — winter fog, summer thunderstorms
5. **Day of week** — weekend schedules differ
6. **Recent delay trend** — cascading delays from earlier flights

### OpenMeteo Historical API Notes
- Endpoint: `https://archive-api.open-meteo.com/v1/archive`
- Free tier: 10,000 requests/day, data from 1940-present
- Can request up to 1 year of data per request
- Same hourly parameters as forecast API
- Response format identical to forecast API
