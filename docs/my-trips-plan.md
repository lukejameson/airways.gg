# Plan: My Trips — Personalized Flight Tracking

## Context

airways.gg is a real-time Guernsey Airport flight tracker. After a week-long outage the app is relaunching, and the goal is to ship a feature that makes the app a must-have for every traveler flying through GCI — something that creates a daily habit loop. "My Trips" lets users save the flights they're traveling on and receive proactive push notifications (check-in reminder, status changes, pre-departure, landing), so they never have to manually check the app again.

Auth tables (users, sessions) already exist in the DB schema but are not yet wired into SvelteKit. This feature implements auth first, then My Trips on top.

> **Note:** The notification delivery mechanism (push vs email vs in-page) still needs to be decided. The existing push notification service has not been tested yet — validate it before extending.

---

## What We're Building

1. **Auth** — login/register pages + session middleware (prerequisite)
2. **My Trips page** — `/trips`, shows all saved upcoming flights with countdown and status
3. **"I'm flying this" button** — one-tap on any flight detail page to save the trip
4. **Smart notifications** — 4 types sent automatically per trip:
   - 24h check-in reminder (with link to Aurigny check-in portal)
   - Status change alert (delay, cancellation, gate info)
   - 2–3h pre-departure reminder
   - Landing confirmation
5. **Nav link** — "My Trips" in the top nav with badge count

---

## Database Changes

### New tables in `packages/database/schema.ts`

```ts
export const userTrips = pgTable('user_trips', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  flightId: integer('flight_id').notNull().references(() => flights.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ uniq: unique().on(t.userId, t.flightId) }));

export const tripNotificationLog = pgTable('trip_notification_log', {
  id: serial('id').primaryKey(),
  userTripId: uuid('user_trip_id').notNull().references(() => userTrips.id, { onDelete: 'cascade' }),
  notificationType: text('notification_type').notNull(), // 'check_in' | 'pre_departure' | 'status_change' | 'landed'
  statusHistoryId: integer('status_history_id'), // for status_change type only
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### Modify `push_subscriptions` — add `userId` column (nullable)
Allows linking a device's push subscription to a user account.

### Migration: `packages/database/migrations/0015_user_trips.sql`
- Create `user_trips` and `trip_notification_log` tables
- Add nullable `user_id` column to `push_subscriptions`

---

## Auth Implementation

### `apps/web/src/app.d.ts`
Add to `App.Locals`:
```ts
user?: { id: string; email: string; role: string }
```

### `apps/web/src/hooks.server.ts` (new file)
Session validation on every request:
- Read `session` cookie
- Query sessions table, check expiry
- Set `locals.user` if valid session found
- Delete expired sessions

### `apps/web/src/routes/login/+page.svelte` + `+page.server.ts` (new)
- Email + password form
- Server action: validate credentials with bcrypt, create session row, set `httpOnly` cookie
- Redirect to `/trips` on success, or to `?redirect` param

### `apps/web/src/routes/register/+page.svelte` + `+page.server.ts` (new)
- Email + password + confirm form
- Server action: check email not taken, bcrypt hash, insert user, create session, set cookie
- Redirect to `/trips` on success

### `apps/web/src/routes/api/auth/logout/+server.ts` (new)
- DELETE: clear session from DB, clear cookie, redirect to `/`

---

## My Trips Feature

### `packages/database/schema.ts`
Export `userTrips` and `tripNotificationLog`.

### `apps/web/src/lib/server/db.ts`
Re-export `userTrips`, `tripNotificationLog` for Rollup static trace.

### API routes

**`apps/web/src/routes/api/trips/+server.ts`**
- `GET`: return all trips for `locals.user`, joined with flight + status (requires auth)
- `POST`: save a trip for `locals.user` given `{ flightId }` body; also update push_subscription userId if endpoint provided (requires auth)

**`apps/web/src/routes/api/trips/[flightId]/+server.ts`**
- `DELETE`: remove trip for `locals.user` + given flightId (requires auth)

### `apps/web/src/lib/components/SaveTripButton.svelte` (new)
- Props: `flightId`, `isSaved` (boolean), `isLoggedIn`
- When not logged in: renders as link to `/login?redirect=/flights/[id]`
- When logged in + not saved: "I'm flying this" button → POST `/api/trips` + register push subscription
- When saved: "Saved ✓" button → DELETE `/api/trips/[flightId]`
- Optimistic UI toggle

### `apps/web/src/routes/flights/[id]/+page.svelte`
Add `SaveTripButton` to the existing top-bar (alongside or replacing the current NotifyButton if it exists).

### `apps/web/src/routes/flights/[id]/+page.server.ts`
Load whether the current user has this flight saved (`isSaved`).

### `apps/web/src/routes/trips/+page.svelte` (new)
- Requires auth (redirect to `/login?redirect=/trips` if not)
- Shows upcoming trips sorted by soonest departure, with:
  - Flight code, route, scheduled departure, countdown ("Flying in 2d 14h")
  - Current status pill (On Time / Delayed Xm / Cancelled)
  - Delay minutes if delayed
  - "Check in with Aurigny →" link (opens Aurigny booking portal in new tab) — shown when < 24h to departure
  - Remove button per trip

### `apps/web/src/routes/trips/+page.server.ts` (new)
- Check `locals.user`, redirect if not authenticated
- Load all user_trips joined with flights + latest status

### `apps/web/src/routes/+layout.svelte`
- Read `locals.user` from layout load
- Add "My Trips" link to nav (badge showing count of upcoming trips if any)
- Add login/logout to nav right section

### `apps/web/src/routes/+layout.server.ts`
- Pass `locals.user` and trip count to layout

---

## Notification Service Extension

> **TODO:** Decide notification delivery mechanism before implementing this section.
> Options: browser push (existing VAPID setup), email (via Resend/Nodemailer), or both.
> The existing push notification service has not been tested — validate it first.

### `apps/notification-service/src/dispatcher.ts`

**Extend existing status-change loop:**
When processing new `flightStatusHistory` entries, additionally:
1. Query `user_trips` for affected `flightId`
2. For each user, find their push subscriptions by `userId`
3. Send status-change notification + log to `trip_notification_log`

**New: scheduled notification function `dispatchTripReminders()`:**
Runs on a slower interval (every 5 minutes). For each active user trip joined with flight data:

| Condition | Notification | Guard |
|-----------|-------------|-------|
| `scheduled_departure` is 22–26h from now | Check-in reminder with Aurigny link | `trip_notification_log` has no `check_in` row for this trip |
| `scheduled_departure` is 2–3h from now | Pre-departure reminder with current status | No `pre_departure` row |
| `flight.status` changed to 'Landed' | Landing confirmation | No `landed` row |

### `apps/notification-service/src/index.ts`
Add second poll loop calling `dispatchTripReminders()` every 5 minutes alongside existing 15s status loop.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `packages/database/schema.ts` | Add `userTrips`, `tripNotificationLog`; add `userId` to `pushSubscriptions` |
| `packages/database/migrations/0015_user_trips.sql` | New migration |
| `apps/web/src/app.d.ts` | Add `user` to `App.Locals` |
| `apps/web/src/hooks.server.ts` | New — session middleware |
| `apps/web/src/routes/login/+page.svelte` | New |
| `apps/web/src/routes/login/+page.server.ts` | New |
| `apps/web/src/routes/register/+page.svelte` | New |
| `apps/web/src/routes/register/+page.server.ts` | New |
| `apps/web/src/routes/api/auth/logout/+server.ts` | New |
| `apps/web/src/routes/api/trips/+server.ts` | New |
| `apps/web/src/routes/api/trips/[flightId]/+server.ts` | New |
| `apps/web/src/routes/trips/+page.svelte` | New |
| `apps/web/src/routes/trips/+page.server.ts` | New |
| `apps/web/src/lib/components/SaveTripButton.svelte` | New |
| `apps/web/src/lib/server/db.ts` | Add new table re-exports |
| `apps/web/src/routes/flights/[id]/+page.svelte` | Add SaveTripButton to top-bar |
| `apps/web/src/routes/flights/[id]/+page.server.ts` | Add `isSaved` to load |
| `apps/web/src/routes/+layout.svelte` | Add nav links (My Trips, Login/Logout) |
| `apps/web/src/routes/+layout.server.ts` | Pass user + trip count |
| `apps/web/src/routes/api/push/subscribe/+server.ts` | Add optional `userId` linkage |
| `apps/notification-service/src/dispatcher.ts` | Extend status-change + add trip reminders |
| `apps/notification-service/src/index.ts` | Add 5-min reminder loop |

---

## Low-Friction Design Principles

- Flight detail page: "I'm flying this" button is prominent, one tap when logged in
- Not logged in: button still shows, tapping takes you to login → redirects back to flight after auth
- Registration: email + password only, no verification email gate (reduces friction)
- Saving a trip auto-enables push notifications for that flight (no separate step)
- My Trips page: direct "Check in with Aurigny →" deeplink when < 24h to departure
- Nav: always visible trip count so users can see saved trips at a glance

---

## Notification Service — Pre-validation (Do First)

The existing notification service (`apps/notification-service/`) has not been tested in production. Before extending it, validate the existing mechanism:

1. Start the notification service locally and confirm it connects to the DB and starts the poll loop
2. Manually insert a row into `flight_status_history` for a flight that has a `push_subscription` and verify a web-push notification is delivered
3. Confirm the watermark advances correctly and no duplicate notifications fire on subsequent polls
4. Fix any bugs found before building the trip notification extensions

---

## Verification

1. Register a new account → redirected to /trips (empty state)
2. Browse to a flight detail page → "I'm flying this" button visible
3. Tap button → trip appears in /trips with countdown
4. Trip notification log populated when notification service runs
5. Check-in notification arrives 24h before scheduled departure
6. Status change notification fires when flight status updates
7. Remove trip → disappears from /trips, no further notifications
8. Login from a different browser → same trips visible (cross-device confirmed)
