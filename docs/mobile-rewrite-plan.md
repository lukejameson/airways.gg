# Plan: airways.gg — Compose Multiplatform Rewrite (iOS + Android + Web)

## Context

airways.gg is a real-time Guernsey Airport flight tracker. The existing SvelteKit web app will be replaced with a **Compose Multiplatform** application — a single Kotlin codebase for iOS, Android, and Web. Shared UI composables and business logic live once; platform-specific code (maps, push notifications) is isolated per target. A new dedicated REST API service (`projects/api`) replaces the SvelteKit SSR loaders as the backend for all platforms.

**v1 scope:** iOS app + web app (replacing SvelteKit). Features: flight board, flight detail with live map, APNs push notifications.  
**Future:** Android target from the same codebase.

---

## Architecture
```
apps/
  composeapp/           ← NEW: Compose Multiplatform (single UI codebase)
    composeApp/src/
      commonMain/       ← Shared Compose UI + models + logic (all platforms)
      iosMain/          ← MapKit, APNs bridge
      androidMain/      ← Google Maps, FCM bridge (future)
      wasmJsMain/       ← Leaflet.js interop, Web Push bridge
    iosApp/             ← Minimal Xcode entry point (bootstraps KMP framework)
    androidApp/         ← Minimal Android entry point (future)
    webApp/             ← Compose for Web entry point
  notification-service/ ← EXTEND: APNs delivery alongside existing Web Push
packages/
  database/             ← REUSE: existing Drizzle schema + client
```

The existing `apps/web` (SvelteKit) remains in production until the Compose Web version reaches feature parity, then is retired.

---

## About Hono (API framework choice)

Hono is a TypeScript-first, lightweight HTTP framework — effectively a modern Express with better ergonomics. It was created by Cloudflare and has 20k+ GitHub stars. It works on Node.js, Deno, Bun, and edge runtimes. It's the right fit here: TypeScript-native, simple routing, built-in Zod validation, zero config, and it slots neatly into the existing monorepo pattern. Unlike tRPC, it produces plain JSON REST endpoints that Ktor (the KMP HTTP client) can consume without a TypeScript client.

---

## Pre-conditions (must be done before Phase 3)

- Register App ID `gg.airways.app` in Apple Developer Portal with Push Notifications capability
- Generate APNs Auth Key (`.p8`) — produces `APNS_KEY_ID` and `APNS_TEAM_ID`
- Create an iOS distribution/development provisioning profile

---

## Phase 1: Backend API Service (`projects/api`)

**Goal:** Create the JSON REST API that all platforms call. This unblocks every subsequent phase.

### Files to create

```
projects/api/
  package.json          (name: @airways/api, deps: hono, @hono/node-server, zod, dotenv)
  tsconfig.json         (extends ../../tsconfig.base.json)
  Dockerfile            (multi-stage; mirrors apps/position-service/Dockerfile exactly)
  src/
    index.ts            (Hono app, port 3001)
    routes/
      flights.ts        (GET /flights, GET /flights/:id, GET /flights/search)
      push.ts           (POST/DELETE /push/apns, GET /push/apns/check/:flightId)
      airports.ts       (GET /airports/:code/weather)
    lib/
      db.ts             (re-export from @airways/database)
      queries/
        flightBoard.ts  (mirrors +page.server.ts load() in apps/web/src/routes/)
        flightDetail.ts (mirrors apps/web/src/routes/flights/[id]/+page.server.ts)
        search.ts       (mirrors apps/web/src/routes/search/+page.server.ts)
```

### Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/flights?date=&direction=&includeCompleted=` | Flight board |
| GET | `/flights/:id` | Full detail: status history, rotation, position, weather |
| GET | `/flights/search?q=&date=&from=&to=` | Search |
| GET | `/airports/:code/weather` | Latest weather |
| POST | `/push/apns` | `{ deviceToken, flightId, flightCode, flightDate }` |
| DELETE | `/push/apns` | `{ deviceToken, flightId }` |
| GET | `/push/apns/check/:flightId?token=` | `{ subscribed: boolean }` |

All inputs validated with Zod at route boundaries.

### DB migration

**New file:** `packages/database/migrations/0007_apns_subscriptions.sql`
```sql
CREATE TABLE apns_subscriptions (
  id               SERIAL PRIMARY KEY,
  device_token     TEXT NOT NULL,
  flight_id        INTEGER NOT NULL REFERENCES flights(id),
  flight_code      TEXT NOT NULL,
  flight_date      DATE NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  last_notified_at TIMESTAMPTZ,
  UNIQUE(device_token, flight_id)
);
```

**Modify:** `packages/database/schema.ts` — add `apnsSubscriptions` Drizzle table.

### Docker / Compose

- `projects/api/Dockerfile` — follows `apps/position-service/Dockerfile` pattern
- Modify `docker-compose.yml`, `.dev.yml`, `.prod.yml` — add `api` service on port `3001`
- Modify `.env.example` — add `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_KEY_PATH`

---

## Phase 2: Compose Multiplatform Project Scaffold (`apps/composeapp`)

**Goal:** Bootstrap the KMP + Compose Multiplatform project structure. No real screens yet — just the skeleton that all subsequent phases build on.

### Toolchain

- Kotlin 2.x + KMP plugin + Compose Multiplatform plugin
- HTTP client: **Ktor** (multiplatform)
- Serialization: **kotlinx.serialization**
- Coroutines: **kotlinx.coroutines**
- Settings: **multiplatform-settings** (NSUserDefaults on iOS, JS localStorage on web)
- Build: Gradle with version catalog

### Project structure

```
apps/composeapp/
  gradle/
    libs.versions.toml          (version catalog)
  composeApp/
    src/
      commonMain/kotlin/gg/airways/
        data/
          models/               (Flight, FlightDetail, Weather, StatusHistoryEntry,
                                  AircraftPosition, AircraftRotationEntry — @Serializable)
          api/
            AirwaysApiClient.kt (Ktor HttpClient interface + impl)
            ApiError.kt
          repositories/
            FlightRepository.kt
        domain/
          FlightStatusCalculator.kt   (ports status logic from +page.svelte)
          DelayFormatter.kt
          WeatherFormatter.kt         (code → label + icon name)
          FlightCompletionChecker.kt  (ports completion logic from +page.server.ts)
          DelayReasonExtractor.kt     (regex parsing, ported from web)
        ui/
          screens/                    (filled in Phase 3+)
          components/
          theme/
            AirwaysTheme.kt
        platform/
          PushService.kt              (expect interface)
          MapComponent.kt             (expect composable)
      iosMain/kotlin/gg/airways/
        platform/
          PushService.ios.kt          (actual — APNs)
          MapComponent.ios.kt         (actual — MapKit via UIKitView)
      androidMain/kotlin/gg/airways/  (stubbed, implemented in future Android phase)
        platform/
          PushService.android.kt
          MapComponent.android.kt
      wasmJsMain/kotlin/gg/airways/
        platform/
          PushService.wasmJs.kt       (actual — Web Push via JS interop)
          MapComponent.wasmJs.kt      (actual — Leaflet.js via JS interop)
  iosApp/
    iosApp.xcodeproj                  (minimal Xcode project, bootstraps ComposeApp)
    iosApp/
      ContentView.swift               (hosts ComposeUIViewController)
      iOSApp.swift                    (app entry, APNs delegate)
  webApp/
    index.html
    composeApp.js                     (built output target)
  build.gradle.kts
  settings.gradle.kts
```

### Shared domain logic (all ported from SvelteKit)

| Web source | KMP equivalent |
|-----------|---------------|
| Status calculation in `+page.svelte` | `FlightStatusCalculator.kt` |
| Delay reason regex in `+page.svelte` | `DelayReasonExtractor.kt` |
| Completion detection in `+page.server.ts` | `FlightCompletionChecker.kt` |
| Weather icon day/night logic | `WeatherFormatter.kt` |
| Flight sort by estimated dep | `FlightRepository.kt` |

---

## Phase 3: Shared UI Screens + iOS Platform Layer

**Goal:** Build the shared Compose UI screens and wire up iOS-specific platform code. Result: a working iOS app.

### Shared Compose screens (`commonMain`)

```
ui/
  screens/
    FlightBoardScreen.kt     (ViewModel + StateFlow, tab: Departures/Arrivals)
    FlightDetailScreen.kt    (ViewModel + StateFlow, full detail)
    SearchScreen.kt          (debounced query, date + route filters)
  components/
    FlightCard.kt
    FlightCardSkeleton.kt
    WeatherCard.kt
    StatusTimeline.kt
    AircraftRotationCard.kt
    NotifyButton.kt          (calls expect PushService)
    DelayBadge.kt
    AirportBadge.kt
    WeatherIcon.kt           (maps WeatherFormatter icon name to platform icon)
  navigation/
    AppNavigation.kt         (NavHost: Board → Detail, Board → Search)
  viewmodels/
    FlightBoardViewModel.kt  (StateFlow, 5-min auto-refresh, filters)
    FlightDetailViewModel.kt (loads detail, polls position every 30s if airborne)
    SearchViewModel.kt
```

**FlightBoardScreen:** Tabs for departures/arrivals; filter chips (Next hour, Delayed, Show completed); pull-to-refresh; recently viewed horizontal strip; 5-min auto-refresh.

**FlightDetailScreen:** Status badge + delay counter header; `MapComponent` (expect/actual — MapKit on iOS); dep/arr weather cards; status timeline (deduplicated); aircraft rotation list; `NotifyButton`.

**SearchScreen:** TextField with 300ms debounce; date picker; route selector; results list.

### iOS platform implementations (`iosMain`)

**`MapComponent.ios.kt`** — `UIKitView` wrapping `MKMapView`:
- Aircraft annotation with heading rotation
- Departure + arrival airport pin annotations
- Expand/collapse gesture

**`PushService.ios.kt`** — implements the `expect PushService` interface:
- Calls `UIApplication.shared.registerForRemoteNotifications()` on first use
- APNs token delivered via `iOSApp.swift` delegate → passed into KMP via a callback
- `registerForFlight()` → POST to `/push/apns`
- `unregisterForFlight()` → DELETE `/push/apns`

**`iOSApp.swift`** (in `iosApp/`):
```swift
func application(_:didRegisterForRemoteNotificationsWithDeviceToken:) {
    // Pass hex-encoded token into KMP PushService
}
// On notification tap: read flightId from userInfo → navigate via KMP NavController
```

### iOS app target specifics

- Minimum deployment: **iOS 16.0**
- Bundle ID: `gg.airways.app`
- Capabilities: Push Notifications, Background Modes (remote notifications)
- `iosApp.xcodeproj` is minimal — just `iOSApp.swift` + `ContentView.swift` hosting `ComposeUIViewController`

---

## Phase 4: Web Platform Layer (replaces SvelteKit)

**Goal:** Deploy the Compose for Web version and retire the SvelteKit app.

### Web platform implementations (`wasmJsMain`)

**`MapComponent.wasmJs.kt`** — Leaflet.js interop via `@JsModule`:
- Import Leaflet as an ES module
- Render map in a `div` element
- Aircraft + airport markers, same data as iOS

**`PushService.wasmJs.kt`** — Web Push API via JS interop:
- Reuses existing VAPID infrastructure (no APNs needed on web)
- Calls `navigator.serviceWorker` + `PushManager.subscribe()`
- POSTs Web Push subscription to existing `/api/push/subscribe` endpoint (unchanged from SvelteKit era)
- Service worker (`service-worker.js`) — remains largely as-is from current `apps/web/src/service-worker.ts`

**`WeatherIcon.kt` (wasmJs actual)** — web uses inline SVG or `<img>` tags; maps icon names from `WeatherFormatter` to existing SVG assets from the SvelteKit app.

### Web build + deployment

- `./gradlew :composeApp:wasmJsBrowserDistribution` — outputs to `webApp/dist/`
- `webApp/index.html` — single page, loads the wasmJs bundle
- SEO note: Compose for Web renders to canvas — no DOM content for crawlers. Add an `<noscript>` SSR fallback or static HTML meta tags. This is a known limitation of Compose Web; accept for v1.
- Replace `apps/web` in Docker Compose with a static file server (`nginx`) serving the `webApp/dist/` output

### SvelteKit retirement

- Keep `apps/web` running until Compose Web achieves full visual parity
- Deploy Compose Web version to a staging URL first for side-by-side comparison
- Remove `apps/web` from `docker-compose.yml` once Compose Web is confirmed stable in production

---

## Phase 5: Extend Notification Service for APNs

**Goal:** Send native push notifications to iOS devices on flight status changes.

### Files to modify

- `apps/notification-service/src/dispatcher.ts`
- `apps/notification-service/package.json` (add `@parse/node-apn`)

### Changes

Add `sendApnsNotifications(flightId, statusMessage)` to `dispatcher.ts`:
- Query `apns_subscriptions` for `flightId`
- Send via APNs HTTP/2 provider API using `@parse/node-apn`
- Credentials from env: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_KEY_PATH`
- Delete rows where APNs returns `410 Unregistered`

APNs payload:
```json
{
  "aps": { "alert": { "title": "GR611 LGW→GCI", "body": "Status: Landed 14:32" }, "sound": "default" },
  "flightId": 12345
}
```

Call `sendApnsNotifications()` in parallel with existing `sendWebPushNotifications()`.

---

## Phase 6: Android (Future)

Already architected for. When ready:
1. Implement `PushService.android.kt` (FCM token → `/push/fcm` endpoint, new DB table `fcm_subscriptions`)
2. Implement `MapComponent.android.kt` (Google Maps or OSMDroid `AndroidView`)
3. Add FCM delivery to `notification-service/dispatcher.ts`
4. Build + publish Android APK from existing `composeApp` codebase

No UI code changes needed — all screens are already in `commonMain`.

---

## Files to Create / Modify (Summary)

| Path | Action |
|------|--------|
| `projects/api/` (entire service) | Create |
| `apps/composeapp/` (entire KMP project) | Create |
| `packages/database/migrations/0007_apns_subscriptions.sql` | Create |
| `packages/database/schema.ts` | Modify |
| `apps/notification-service/src/dispatcher.ts` | Modify |
| `apps/notification-service/package.json` | Modify |
| `docker-compose.yml`, `.dev.yml`, `.prod.yml` | Modify |
| `.env.example` | Modify |
| `apps/web` | Retire (after Phase 4) |

---

## Implementation Order & Dependencies

```
Phase 1 (API + DB)
    ↓
Phase 2 (KMP scaffold + shared logic)
    ↓
Phase 3 (Shared UI + iOS layer) ←── test on iOS device
    ↓
Phase 4 (Web layer)             ←── deploys alongside existing SvelteKit
    ↓
Phase 5 (APNs in notif service) ←── can run parallel to Phase 4
    ↓
Phase 6 (Android, future)
```

---

## Verification

1. **Phase 1:** `curl http://localhost:3001/flights?date=today` returns JSON flight array
2. **Phase 1:** `npm run migrate` → `apns_subscriptions` table exists
3. **Phase 3 (iOS):** App runs in Xcode simulator → flight board loads → tapping flight opens detail with map
4. **Phase 3 (iOS, device):** Tap "Notify me" → APNs permission prompt → token registered in DB
5. **Phase 5:** Trigger a flight status change → notification received on iOS device → tap opens `FlightDetailScreen`
6. **Phase 4 (Web):** `./gradlew wasmJsBrowserRun` → Compose web app loads in browser → flight board works → maps render via Leaflet
7. **End-to-end:** Web Push notification on browser still works (existing VAPID flow unchanged)
