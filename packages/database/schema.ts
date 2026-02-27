import {
  pgTable,
  serial,
  varchar,
  timestamp,
  integer,
  boolean,
  text,
  jsonb,
  real,
  date,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['admin', 'user']);
export const scraperServiceEnum = pgEnum('scraper_service', ['aurigny_live', 'guernsey_historical', 'aurigny_prefetch']);
export const scraperStatusEnum = pgEnum('scraper_status', ['success', 'failure', 'retry']);
export const confidenceEnum = pgEnum('confidence_level', ['low', 'medium', 'high']);
export const statusSourceEnum = pgEnum('status_source', ['aurigny', 'guernsey_airport']);

export const users = pgTable('users', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: userRoleEnum('role').notNull().default('user'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('users_email_idx').on(table.email),
]);

export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('sessions_token_idx').on(table.token),
  index('sessions_user_id_idx').on(table.userId),
]);

// Legacy tables — kept for backward compatibility during migration
export const departures = pgTable('departures', {
  id: serial('id').primaryKey(),
  airline: varchar('airline', { length: 100 }).notNull(),
  location: varchar('location', { length: 200 }).notNull(),
  code: varchar('code', { length: 100 }).notNull(),
  scheduledTime: timestamp('scheduled_time').notNull(),
  actualTime: timestamp('actual_time').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('departures_scheduled_time_idx').on(table.scheduledTime),
  index('departures_airline_idx').on(table.airline),
  index('departures_code_idx').on(table.code),
]);

export const arrivals = pgTable('arrivals', {
  id: serial('id').primaryKey(),
  airline: varchar('airline', { length: 100 }).notNull(),
  location: varchar('location', { length: 200 }).notNull(),
  code: varchar('code', { length: 100 }).notNull(),
  scheduledTime: timestamp('scheduled_time').notNull(),
  actualTime: timestamp('actual_time').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('arrivals_scheduled_time_idx').on(table.scheduledTime),
  index('arrivals_airline_idx').on(table.airline),
  index('arrivals_code_idx').on(table.code),
]);

export const flights = pgTable('flights', {
  id: serial('id').primaryKey(),
  uniqueId: varchar('unique_id', { length: 50 }).notNull().unique(),
  flightNumber: varchar('flight_number', { length: 20 }).notNull(),
  airlineCode: varchar('airline_code', { length: 10 }).notNull(),
  departureAirport: varchar('departure_airport', { length: 10 }).notNull(),
  arrivalAirport: varchar('arrival_airport', { length: 10 }).notNull(),
  scheduledDeparture: timestamp('scheduled_departure').notNull(),
  scheduledArrival: timestamp('scheduled_arrival').notNull(),
  actualDeparture: timestamp('actual_departure'),
  actualArrival: timestamp('actual_arrival'),
  status: varchar('status', { length: 50 }),
  canceled: boolean('canceled').default(false),
  aircraftRegistration: varchar('aircraft_registration', { length: 20 }),
  aircraftType: varchar('aircraft_type', { length: 20 }),
  delayMinutes: integer('delay_minutes'),
  flightDate: date('flight_date').notNull(),
  rawXml: text('raw_xml'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('flights_unique_id_idx').on(table.uniqueId),
  index('flights_flight_number_idx').on(table.flightNumber),
  index('flights_flight_date_idx').on(table.flightDate),
  index('flights_scheduled_departure_idx').on(table.scheduledDeparture),
  index('flights_departure_airport_idx').on(table.departureAirport),
  index('flights_arrival_airport_idx').on(table.arrivalAirport),
  index('flights_status_idx').on(table.status),
  index('flights_airline_date_idx').on(table.airlineCode, table.flightDate),
]);

export const flightDelays = pgTable('flight_delays', {
  id: serial('id').primaryKey(),
  flightId: integer('flight_id').notNull().references(() => flights.id, { onDelete: 'cascade' }),
  delayCode: varchar('delay_code', { length: 20 }),
  delayCode2: varchar('delay_code2', { length: 20 }),
  minutes: integer('minutes').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('flight_delays_flight_id_idx').on(table.flightId),
  uniqueIndex('flight_delays_unique_idx').on(table.flightId, table.delayCode, table.minutes),
]);

export const flightTimes = pgTable('flight_times', {
  id: serial('id').primaryKey(),
  flightId: integer('flight_id').notNull().references(() => flights.id, { onDelete: 'cascade' }),
  timeType: varchar('time_type', { length: 50 }).notNull(),
  timeValue: timestamp('time_value').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('flight_times_flight_id_idx').on(table.flightId),
  uniqueIndex('flight_times_unique_idx').on(table.flightId, table.timeType),
]);

export const flightNotes = pgTable('flight_notes', {
  id: serial('id').primaryKey(),
  flightId: integer('flight_id').notNull().references(() => flights.id, { onDelete: 'cascade' }),
  timestamp: timestamp('timestamp').notNull(),
  noteType: varchar('note_type', { length: 50 }),
  message: text('message').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('flight_notes_flight_id_idx').on(table.flightId),
  // Natural dedup key — prevents re-inserting the same note on every scrape cycle
  uniqueIndex('flight_notes_unique_idx').on(table.flightId, table.timestamp),
]);

export const flightStatusHistory = pgTable('flight_status_history', {
  id: serial('id').primaryKey(),
  flightCode: varchar('flight_code', { length: 20 }).notNull(),
  flightDate: date('flight_date').notNull(),
  statusTimestamp: timestamp('status_timestamp').notNull(),
  statusMessage: text('status_message').notNull(),
  source: statusSourceEnum('source').notNull(),
  flightId: integer('flight_id').references(() => flights.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('flight_status_history_code_idx').on(table.flightCode),
  index('flight_status_history_date_idx').on(table.flightDate),
  index('flight_status_history_source_idx').on(table.source),
  index('flight_status_history_flight_id_idx').on(table.flightId),
  // Natural deduplication key — prevents re-scraping same status update
  uniqueIndex('flight_status_history_unique_idx').on(
    table.flightCode,
    table.flightDate,
    table.statusTimestamp,
    table.source,
  ),
]);

export const weatherData = pgTable('weather_data', {
  id: serial('id').primaryKey(),
  airportCode: varchar('airport_code', { length: 10 }).notNull(),
  timestamp: timestamp('timestamp').notNull(),
  // real() returns JS number; decimal() returns string — use real for numeric operations
  temperature: real('temperature'),
  windSpeed: real('wind_speed'),
  windDirection: integer('wind_direction'),
  precipitation: real('precipitation'),
  visibility: real('visibility'),
  cloudCover: integer('cloud_cover'),
  pressure: real('pressure'),
  weatherCode: integer('weather_code'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('weather_data_airport_idx').on(table.airportCode),
  index('weather_data_timestamp_idx').on(table.timestamp),
  uniqueIndex('weather_data_unique_idx').on(table.airportCode, table.timestamp),
]);

export const airportDaylight = pgTable('airport_daylight', {
  id: serial('id').primaryKey(),
  airportCode: varchar('airport_code', { length: 10 }).notNull(),
  date: date('date').notNull(),
  sunrise: timestamp('sunrise').notNull(),
  sunset: timestamp('sunset').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('airport_daylight_unique_idx').on(table.airportCode, table.date),
  index('airport_daylight_airport_idx').on(table.airportCode),
]);

export const airports = pgTable('airports', {
  id: serial('id').primaryKey(),
  iataCode: varchar('iata_code', { length: 10 }).notNull().unique(),
  icaoCode: varchar('icao_code', { length: 10 }),
  name: varchar('name', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  city: varchar('city', { length: 100 }),
  country: varchar('country', { length: 100 }),
  latitude: real('latitude'),
  longitude: real('longitude'),
  elevationFt: integer('elevation_ft'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('airports_iata_idx').on(table.iataCode),
  index('airports_icao_idx').on(table.icaoCode),
]);

export const delayPredictions = pgTable('delay_predictions', {
  id: serial('id').primaryKey(),
  flightId: integer('flight_id').notNull().references(() => flights.id, { onDelete: 'cascade' }),
  probability: real('probability').notNull(),
  confidence: confidenceEnum('confidence').notNull(),
  predictedDelayMinutes: integer('predicted_delay_minutes').notNull(),
  modelVersion: varchar('model_version', { length: 50 }).notNull(),
  featuresUsed: jsonb('features_used'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
}, (table) => [
  index('delay_predictions_flight_id_idx').on(table.flightId),
  index('delay_predictions_expires_at_idx').on(table.expiresAt),
  index('delay_predictions_created_at_idx').on(table.createdAt),
]);

export const scraperLogs = pgTable('scraper_logs', {
  id: serial('id').primaryKey(),
  service: scraperServiceEnum('service').notNull(),
  status: scraperStatusEnum('status').notNull(),
  recordsScraped: integer('records_scraped').default(0),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),
  startedAt: timestamp('started_at').notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => [
  index('scraper_logs_service_idx').on(table.service),
  index('scraper_logs_status_idx').on(table.status),
  index('scraper_logs_started_at_idx').on(table.startedAt),
]);

export const aircraftPositions = pgTable('aircraft_positions', {
  id: serial('id').primaryKey(),
  flightId: integer('flight_id').references(() => flights.id, { onDelete: 'cascade' }),
  fr24Id: varchar('fr24_id', { length: 50 }),         // FR24 internal flight-leg ID
  lat: real('lat').notNull(),
  lon: real('lon').notNull(),
  altitudeFt: integer('altitude_ft'),
  groundSpeedKts: integer('ground_speed_kts'),
  heading: integer('heading'),
  verticalSpeedFpm: integer('vertical_speed_fpm'),
  callsign: varchar('callsign', { length: 20 }),
  registration: varchar('registration', { length: 20 }),
  aircraftType: varchar('aircraft_type', { length: 10 }),
  originIata: varchar('origin_iata', { length: 5 }),
  destIata: varchar('dest_iata', { length: 5 }),
  eta: timestamp('eta'),
  onGround: boolean('on_ground').notNull().default(false),
  positionTimestamp: timestamp('position_timestamp').notNull(),  // time from FR24
  fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
}, (table) => [
  index('aircraft_positions_flight_id_idx').on(table.flightId),
  index('aircraft_positions_fetched_at_idx').on(table.fetchedAt),
  uniqueIndex('aircraft_positions_flight_timestamp_idx').on(table.flightId, table.positionTimestamp),
]);

export const mlModelMetrics = pgTable('ml_model_metrics', {
  id: serial('id').primaryKey(),
  modelVersion: varchar('model_version', { length: 50 }).notNull().unique(),
  accuracy: real('accuracy'),
  precision: real('precision'),
  recall: real('recall'),
  f1Score: real('f1_score'),
  trainedAt: timestamp('trained_at').notNull(),
  trainingRecords: integer('training_records'),
  features: jsonb('features'),
}, (table) => [
  uniqueIndex('ml_model_metrics_version_idx').on(table.modelVersion),
  index('ml_model_metrics_trained_at_idx').on(table.trainedAt),
]);
