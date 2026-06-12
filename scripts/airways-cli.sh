#!/usr/bin/env bash
# airways.gg API CLI — quick access to debug endpoints
# Usage: ./scripts/airways-cli.sh <command> [args...]

set -euo pipefail

BASE="https://airways.gg"
AUTH="Authorization: Bearer ac504f9dc9c07ad7d3fb53ecefe0ccecd2beab6922d0bb6eb3bc1898a8919da1"

die() { echo "ERROR: $*" >&2; exit 1; }

api() {
  curl -s -H "$AUTH" "$@"
}

cmd_flights() {
  local date="${1:-today}"
  if [[ "$date" == "today" ]]; then
    date="2026-06-12"  # adjust as needed
  fi
  api "$BASE/api/debug/flights" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for r in data['rows']:
    fn   = r.get('flightNumber','?')
    dep  = r.get('departureAirport','?')
    arr  = r.get('arrivalAirport','?')
    sdep = (r.get('scheduledDeparture') or '?')[:16]
    sarr = (r.get('scheduledArrival') or '?')[:16]
    adep = (r.get('actualDeparture') or '?')[:16]
    aarr = (r.get('actualArrival') or '?')[:16]
    st   = r.get('status','?')
    del  = r.get('delayMinutes','')
    reg  = r.get('aircraftRegistration','')
    date = r.get('flightDate','')
    print(f'{fn:8s} {dep:6s}->{arr:6s}  sched {sdep} / {sarr}  actual {adep} / {aarr}  {st:15s}  +{del}m  {reg}')
" 2>/dev/null
}

cmd_flight() {
  local fn="$1"
  local date="${2:-2026-06-12}"
  api "$BASE/api/debug/sql" -H "Content-Type: application/json" \
    -d "{\"sql\": \"SELECT * FROM flights WHERE flight_number = '$fn' AND flight_date = '$date'\"}" \
    | python3 -m json.tool 2>/dev/null
}

cmd_positions() {
  api "$BASE/api/debug/positions" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for r in data['rows']:
    if r.get('onGround'): continue
    reg  = r.get('registration','?')
    cs   = r.get('callsign','?')
    lat  = r.get('lat',0)
    lon  = r.get('lon',0)
    alt  = r.get('altitudeFt',0)
    gs   = r.get('groundSpeedKts',0)
    hdg  = r.get('heading',0)
    eta  = r.get('eta','')[:16]
    print(f'{cs:10s} {reg:8s}  {lat:7.2f} {lon:7.2f}  alt={alt:5d}ft  gs={gs:3d}kts  hdg={hdg:3d}  eta={eta}')
" 2>/dev/null
}

cmd_aircraft() {
  local reg="${1:-}"
  api "$BASE/api/debug/positions" | python3 -c "
import json, sys
reg_filter = '${reg}'.upper()
data = json.load(sys.stdin)
for r in data['rows']:
    if reg_filter and r.get('registration','').upper() != reg_filter: continue
    print(json.dumps(r, indent=2, default=str))
" 2>/dev/null
}

cmd_sql() {
  local query="$*"
  api "$BASE/api/debug/sql" -H "Content-Type: application/json" \
    -d "{\"sql\": \"$query\"}" | python3 -m json.tool 2>/dev/null
}

cmd_today() {
  local date="${1:-2026-06-12}"
  api "$BASE/api/debug/sql" -H "Content-Type: application/json" \
    -d "{\"sql\": \"SELECT flight_number, departure_airport, arrival_airport, scheduled_departure, scheduled_arrival, status, delay_minutes, aircraft_registration FROM flights WHERE flight_date = '$date' ORDER BY scheduled_departure\"}" \
    | python3 -c "
import json, sys
data = json.load(sys.stdin)
for r in data['rows']:
    fn  = r.get('flight_number','?')
    dep = r.get('departure_airport','?')
    arr = r.get('arrival_airport','?')
    sdep = (r.get('scheduled_departure') or '?')[:16]
    sarr = (r.get('scheduled_arrival') or '?')[:16]
    st  = r.get('status','?')
    delm = r.get('delay_minutes') or 0
    reg = r.get('aircraft_registration','')
    print(f'{fn:8s} {dep:6s}->{arr:6s}  {sdep} / {sarr}  {st:15s}  +{delm}m  {reg}')
" 2>/dev/null
}

cmd_arrivals() {
  cmd_today "$@" | grep -E -- '->GCI '
}

cmd_departures() {
  cmd_today "$@" | grep -E -- 'GCI ->'
}

cmd_scrapers() {
  api "$BASE/api/debug/scrapers" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for r in data['rows']:
    svc = r.get('service','?')
    st  = r.get('status','?')
    n   = r.get('recordsScraped',0)
    err = r.get('errorMessage','')
    started = (r.get('startedAt') or '?')[:19]
    done = (r.get('completedAt') or '?')[:19]
    print(f'{svc:20s} {st:10s}  records={n:3d}  started={started}  done={done}  {err}')
" 2>/dev/null
}

cmd_weather() {
  local code="${1:-GCI}"
  api "$BASE/api/debug/sql" -H "Content-Type: application/json" \
    -d "{\"sql\": \"SELECT * FROM weather WHERE airport_code = '$code' ORDER BY timestamp DESC LIMIT 20\"}" \
    | python3 -c "
import json, sys
data = json.load(sys.stdin)
for r in data['rows']:
    ts  = r.get('timestamp','?')[:16]
    wsp = r.get('wind_speed','?')
    wdir = r.get('wind_direction','?')
    vis = r.get('visibility','?')
    cc  = r.get('cloud_cover','?')
    wc  = r.get('weather_code','?')
    print(f'{ts}  wind={wsp}kts@{wdir}  vis={vis}sm  clouds={cc}%  code={wc}')
" 2>/dev/null
}

cmd_health() {
  curl -s "$BASE/api/health/timezone" | python3 -m json.tool
}

cmd_help() {
  cat <<EOF
airways-cli — quick access to airways.gg API

Commands:
  flights [date]        List all flights (default: today)
  flight <num> [date]   Show full details for a single flight
  today [date]          Compact today's schedule
  arrivals [date]       Today's arrivals at GCI
  departures [date]     Today's departures from GCI
  positions             Airborne aircraft from FlightRadar24
  aircraft <reg>        Track a specific aircraft by registration
  scrapers              Scraper run status and logs
  weather [code]        Weather forecast for an airport (default: GCI)
  health                API health check
  sql <query>           Run arbitrary SQL (read-only)
EOF
}

case "${1:-help}" in
  flights)    cmd_flights "${2:-}" ;;
  flight)     cmd_flight "${2:?flight number required}" "${3:-2026-06-12}" ;;
  today)      cmd_today "${2:-}" ;;
  arrivals)   cmd_arrivals "${2:-}" ;;
  departures) cmd_departures "${2:-}" ;;
  positions)  cmd_positions ;;
  aircraft)   cmd_aircraft "${2:-}" ;;
  scrapers)   cmd_scrapers ;;
  weather)    cmd_weather "${2:-GCI}" ;;
  health)     cmd_health ;;
  sql)        shift; cmd_sql "$@" ;;
  help|--help|-h) cmd_help ;;
  *)          cmd_help; exit 1 ;;
esac
