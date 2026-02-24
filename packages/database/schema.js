"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mlModelMetrics = exports.scraperLogs = exports.delayPredictions = exports.weatherData = exports.flightStatusHistory = exports.flightNotes = exports.flightTimes = exports.flightDelays = exports.flights = exports.arrivals = exports.departures = exports.sessions = exports.users = exports.statusSourceEnum = exports.confidenceEnum = exports.scraperStatusEnum = exports.scraperServiceEnum = exports.userRoleEnum = void 0;
require("dotenv/config");
const pg_core_1 = require("drizzle-orm/pg-core");
exports.userRoleEnum = (0, pg_core_1.pgEnum)('user_role', ['admin', 'user']);
exports.scraperServiceEnum = (0, pg_core_1.pgEnum)('scraper_service', ['aurigny_live', 'guernsey_historical']);
exports.scraperStatusEnum = (0, pg_core_1.pgEnum)('scraper_status', ['success', 'failure', 'retry']);
exports.confidenceEnum = (0, pg_core_1.pgEnum)('confidence_level', ['low', 'medium', 'high']);
exports.statusSourceEnum = (0, pg_core_1.pgEnum)('status_source', ['aurigny', 'guernsey_airport']);
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    email: (0, pg_core_1.varchar)('email', { length: 255 }).notNull().unique(),
    passwordHash: (0, pg_core_1.varchar)('password_hash', { length: 255 }).notNull(),
    role: (0, exports.userRoleEnum)('role').notNull().default('user'),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').notNull().defaultNow(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)('users_email_idx').on(table.email),
]);
exports.sessions = (0, pg_core_1.pgTable)('sessions', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: (0, pg_core_1.varchar)('user_id', { length: 36 }).notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    token: (0, pg_core_1.varchar)('token', { length: 255 }).notNull().unique(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)('sessions_token_idx').on(table.token),
    (0, pg_core_1.index)('sessions_user_id_idx').on(table.userId),
]);
// Legacy tables — kept for backward compatibility during migration
exports.departures = (0, pg_core_1.pgTable)('departures', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    airline: (0, pg_core_1.varchar)('airline', { length: 100 }).notNull(),
    location: (0, pg_core_1.varchar)('location', { length: 200 }).notNull(),
    code: (0, pg_core_1.varchar)('code', { length: 100 }).notNull(),
    scheduledTime: (0, pg_core_1.timestamp)('scheduled_time').notNull(),
    actualTime: (0, pg_core_1.timestamp)('actual_time').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
}, (table) => [
    (0, pg_core_1.index)('departures_scheduled_time_idx').on(table.scheduledTime),
    (0, pg_core_1.index)('departures_airline_idx').on(table.airline),
    (0, pg_core_1.index)('departures_code_idx').on(table.code),
]);
exports.arrivals = (0, pg_core_1.pgTable)('arrivals', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    airline: (0, pg_core_1.varchar)('airline', { length: 100 }).notNull(),
    location: (0, pg_core_1.varchar)('location', { length: 200 }).notNull(),
    code: (0, pg_core_1.varchar)('code', { length: 100 }).notNull(),
    scheduledTime: (0, pg_core_1.timestamp)('scheduled_time').notNull(),
    actualTime: (0, pg_core_1.timestamp)('actual_time').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
}, (table) => [
    (0, pg_core_1.index)('arrivals_scheduled_time_idx').on(table.scheduledTime),
    (0, pg_core_1.index)('arrivals_airline_idx').on(table.airline),
    (0, pg_core_1.index)('arrivals_code_idx').on(table.code),
]);
exports.flights = (0, pg_core_1.pgTable)('flights', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    uniqueId: (0, pg_core_1.varchar)('unique_id', { length: 50 }).notNull().unique(),
    flightNumber: (0, pg_core_1.varchar)('flight_number', { length: 20 }).notNull(),
    airlineCode: (0, pg_core_1.varchar)('airline_code', { length: 10 }).notNull(),
    departureAirport: (0, pg_core_1.varchar)('departure_airport', { length: 10 }).notNull(),
    arrivalAirport: (0, pg_core_1.varchar)('arrival_airport', { length: 10 }).notNull(),
    scheduledDeparture: (0, pg_core_1.timestamp)('scheduled_departure').notNull(),
    scheduledArrival: (0, pg_core_1.timestamp)('scheduled_arrival').notNull(),
    actualDeparture: (0, pg_core_1.timestamp)('actual_departure'),
    actualArrival: (0, pg_core_1.timestamp)('actual_arrival'),
    status: (0, pg_core_1.varchar)('status', { length: 50 }),
    canceled: (0, pg_core_1.boolean)('canceled').default(false),
    aircraftRegistration: (0, pg_core_1.varchar)('aircraft_registration', { length: 20 }),
    aircraftType: (0, pg_core_1.varchar)('aircraft_type', { length: 20 }),
    delayMinutes: (0, pg_core_1.integer)('delay_minutes'),
    flightDate: (0, pg_core_1.date)('flight_date').notNull(),
    rawXml: (0, pg_core_1.text)('raw_xml'),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').notNull().defaultNow(),
}, (table) => [
    (0, pg_core_1.uniqueIndex)('flights_unique_id_idx').on(table.uniqueId),
    (0, pg_core_1.index)('flights_flight_number_idx').on(table.flightNumber),
    (0, pg_core_1.index)('flights_flight_date_idx').on(table.flightDate),
    (0, pg_core_1.index)('flights_scheduled_departure_idx').on(table.scheduledDeparture),
    (0, pg_core_1.index)('flights_departure_airport_idx').on(table.departureAirport),
    (0, pg_core_1.index)('flights_arrival_airport_idx').on(table.arrivalAirport),
    (0, pg_core_1.index)('flights_status_idx').on(table.status),
    (0, pg_core_1.index)('flights_airline_date_idx').on(table.airlineCode, table.flightDate),
]);
exports.flightDelays = (0, pg_core_1.pgTable)('flight_delays', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    flightId: (0, pg_core_1.integer)('flight_id').notNull().references(() => exports.flights.id, { onDelete: 'cascade' }),
    delayCode: (0, pg_core_1.varchar)('delay_code', { length: 20 }),
    delayCode2: (0, pg_core_1.varchar)('delay_code2', { length: 20 }),
    minutes: (0, pg_core_1.integer)('minutes').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
}, (table) => [
    (0, pg_core_1.index)('flight_delays_flight_id_idx').on(table.flightId),
    (0, pg_core_1.uniqueIndex)('flight_delays_unique_idx').on(table.flightId, table.delayCode, table.minutes),
]);
exports.flightTimes = (0, pg_core_1.pgTable)('flight_times', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    flightId: (0, pg_core_1.integer)('flight_id').notNull().references(() => exports.flights.id, { onDelete: 'cascade' }),
    timeType: (0, pg_core_1.varchar)('time_type', { length: 50 }).notNull(),
    timeValue: (0, pg_core_1.timestamp)('time_value').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
}, (table) => [
    (0, pg_core_1.index)('flight_times_flight_id_idx').on(table.flightId),
    (0, pg_core_1.uniqueIndex)('flight_times_unique_idx').on(table.flightId, table.timeType),
]);
exports.flightNotes = (0, pg_core_1.pgTable)('flight_notes', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    flightId: (0, pg_core_1.integer)('flight_id').notNull().references(() => exports.flights.id, { onDelete: 'cascade' }),
    timestamp: (0, pg_core_1.timestamp)('timestamp').notNull(),
    noteType: (0, pg_core_1.varchar)('note_type', { length: 50 }),
    message: (0, pg_core_1.text)('message').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
}, (table) => [
    (0, pg_core_1.index)('flight_notes_flight_id_idx').on(table.flightId),
]);
exports.flightStatusHistory = (0, pg_core_1.pgTable)('flight_status_history', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    flightCode: (0, pg_core_1.varchar)('flight_code', { length: 20 }).notNull(),
    flightDate: (0, pg_core_1.date)('flight_date').notNull(),
    statusTimestamp: (0, pg_core_1.timestamp)('status_timestamp').notNull(),
    statusMessage: (0, pg_core_1.text)('status_message').notNull(),
    source: (0, exports.statusSourceEnum)('source').notNull(),
    flightId: (0, pg_core_1.integer)('flight_id').references(() => exports.flights.id),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
}, (table) => [
    (0, pg_core_1.index)('flight_status_history_code_idx').on(table.flightCode),
    (0, pg_core_1.index)('flight_status_history_date_idx').on(table.flightDate),
    (0, pg_core_1.index)('flight_status_history_source_idx').on(table.source),
    (0, pg_core_1.index)('flight_status_history_flight_id_idx').on(table.flightId),
    // Natural deduplication key — prevents re-scraping same status update
    (0, pg_core_1.uniqueIndex)('flight_status_history_unique_idx').on(table.flightCode, table.flightDate, table.statusTimestamp, table.source),
]);
exports.weatherData = (0, pg_core_1.pgTable)('weather_data', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    airportCode: (0, pg_core_1.varchar)('airport_code', { length: 10 }).notNull(),
    timestamp: (0, pg_core_1.timestamp)('timestamp').notNull(),
    // real() returns JS number; decimal() returns string — use real for numeric operations
    temperature: (0, pg_core_1.real)('temperature'),
    windSpeed: (0, pg_core_1.real)('wind_speed'),
    windDirection: (0, pg_core_1.integer)('wind_direction'),
    precipitation: (0, pg_core_1.real)('precipitation'),
    visibility: (0, pg_core_1.real)('visibility'),
    cloudCover: (0, pg_core_1.integer)('cloud_cover'),
    pressure: (0, pg_core_1.real)('pressure'),
    weatherCode: (0, pg_core_1.integer)('weather_code'),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
}, (table) => [
    (0, pg_core_1.index)('weather_data_airport_idx').on(table.airportCode),
    (0, pg_core_1.index)('weather_data_timestamp_idx').on(table.timestamp),
    (0, pg_core_1.uniqueIndex)('weather_data_unique_idx').on(table.airportCode, table.timestamp),
]);
exports.delayPredictions = (0, pg_core_1.pgTable)('delay_predictions', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    flightId: (0, pg_core_1.integer)('flight_id').notNull().references(() => exports.flights.id, { onDelete: 'cascade' }),
    probability: (0, pg_core_1.real)('probability').notNull(),
    confidence: (0, exports.confidenceEnum)('confidence').notNull(),
    predictedDelayMinutes: (0, pg_core_1.integer)('predicted_delay_minutes').notNull(),
    modelVersion: (0, pg_core_1.varchar)('model_version', { length: 50 }).notNull(),
    featuresUsed: (0, pg_core_1.jsonb)('features_used'),
    createdAt: (0, pg_core_1.timestamp)('created_at').notNull().defaultNow(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at').notNull(),
}, (table) => [
    (0, pg_core_1.index)('delay_predictions_flight_id_idx').on(table.flightId),
    (0, pg_core_1.index)('delay_predictions_expires_at_idx').on(table.expiresAt),
    (0, pg_core_1.index)('delay_predictions_created_at_idx').on(table.createdAt),
]);
exports.scraperLogs = (0, pg_core_1.pgTable)('scraper_logs', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    service: (0, exports.scraperServiceEnum)('service').notNull(),
    status: (0, exports.scraperStatusEnum)('status').notNull(),
    recordsScraped: (0, pg_core_1.integer)('records_scraped').default(0),
    errorMessage: (0, pg_core_1.text)('error_message'),
    retryCount: (0, pg_core_1.integer)('retry_count').default(0),
    startedAt: (0, pg_core_1.timestamp)('started_at').notNull(),
    completedAt: (0, pg_core_1.timestamp)('completed_at'),
}, (table) => [
    (0, pg_core_1.index)('scraper_logs_service_idx').on(table.service),
    (0, pg_core_1.index)('scraper_logs_status_idx').on(table.status),
    (0, pg_core_1.index)('scraper_logs_started_at_idx').on(table.startedAt),
]);
exports.mlModelMetrics = (0, pg_core_1.pgTable)('ml_model_metrics', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    modelVersion: (0, pg_core_1.varchar)('model_version', { length: 50 }).notNull().unique(),
    accuracy: (0, pg_core_1.real)('accuracy'),
    precision: (0, pg_core_1.real)('precision'),
    recall: (0, pg_core_1.real)('recall'),
    f1Score: (0, pg_core_1.real)('f1_score'),
    trainedAt: (0, pg_core_1.timestamp)('trained_at').notNull(),
    trainingRecords: (0, pg_core_1.integer)('training_records'),
    features: (0, pg_core_1.jsonb)('features'),
}, (table) => [
    (0, pg_core_1.uniqueIndex)('ml_model_metrics_version_idx').on(table.modelVersion),
    (0, pg_core_1.index)('ml_model_metrics_trained_at_idx').on(table.trainedAt),
]);
//# sourceMappingURL=schema.js.map