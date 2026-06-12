#!/usr/bin/env python3
"""airways.gg API CLI — quick access to debug endpoints."""

import json
import sys
import os
import subprocess

BASE = "https://airways.gg"
AUTH = "ac504f9dc9c07ad7d3fb53ecefe0ccecd2beab6922d0bb6eb3bc1898a8919da1"

def api(path: str, method: str = "GET", body: dict | None = None) -> dict:
    cmd = ["curl", "-s", "-H", f"Authorization: Bearer {AUTH}"]
    if body:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    cmd.append(f"{BASE}{path}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout)

def flights():
    data = api("/api/debug/flights")
    for r in data.get("rows", []):
        fn = r.get("flightNumber", "?")
        dep = r.get("departureAirport", "?")
        arr = r.get("arrivalAirport", "?")
        sdep = (r.get("scheduledDeparture") or "?")[:16]
        sarr = (r.get("scheduledArrival") or "?")[:16]
        adep = (r.get("actualDeparture") or "?")[:16]
        aarr = (r.get("actualArrival") or "?")[:16]
        st = r.get("status") or "?"
        dly = r.get("delayMinutes") or 0
        reg = r.get("aircraftRegistration") or ""
        date = r.get("flightDate", "")
        print(f"{fn:8s} {dep:6s}->{arr:6s}  sched {sdep} / {sarr}  actual {adep} / {aarr}  {st:15s}  +{dly}m  {reg}")


def today(date: str = "2026-06-12"):
    data = api("/api/debug/sql", body={
        "sql": f"SELECT flight_number, departure_airport, arrival_airport, scheduled_departure, scheduled_arrival, status, delay_minutes, aircraft_registration FROM flights WHERE flight_date = '{date}' AND canceled = false ORDER BY scheduled_departure"
    })
    for r in data.get("rows", []):
        fn = r.get("flight_number", "?")
        dep = r.get("departure_airport", "?")
        arr = r.get("arrival_airport", "?")
        sdep = (r.get("scheduled_departure") or "?")[:16]
        sarr = (r.get("scheduled_arrival") or "?")[:16]
        st = r.get("status") or "?"
        dly = r.get("delay_minutes") or 0
        reg = r.get("aircraft_registration") or ""
        print(f"{fn:8s} {dep:6s}->{arr:6s}  {sdep} / {sarr}  {st:15s}  +{dly}m  {reg}")


def arrivals(date: str = "2026-06-12"):
    data = api("/api/debug/sql", body={
        "sql": f"SELECT flight_number, departure_airport, arrival_airport, scheduled_departure, scheduled_arrival, status, delay_minutes, aircraft_registration FROM flights WHERE flight_date = '{date}' AND arrival_airport = 'GCI' AND canceled = false ORDER BY scheduled_arrival"
    })
    for r in data.get("rows", []):
        fn = r.get("flight_number", "?")
        dep = r.get("departure_airport", "?")
        sarr = (r.get("scheduled_arrival") or "?")[:16]
        st = r.get("status") or "?"
        dly = r.get("delay_minutes") or 0
        reg = r.get("aircraft_registration") or ""
        print(f"{fn:8s} {dep:6s}->GCI   arr {sarr}  {st:15s}  +{dly}m  {reg}")


def departures(date: str = "2026-06-12"):
    data = api("/api/debug/sql", body={
        "sql": f"SELECT flight_number, departure_airport, arrival_airport, scheduled_departure, scheduled_arrival, status, delay_minutes, aircraft_registration FROM flights WHERE flight_date = '{date}' AND departure_airport = 'GCI' AND canceled = false ORDER BY scheduled_departure"
    })
    for r in data.get("rows", []):
        fn = r.get("flight_number", "?")
        arr = r.get("arrival_airport", "?")
        sdep = (r.get("scheduled_departure") or "?")[:16]
        st = r.get("status") or "?"
        dly = r.get("delay_minutes") or 0
        reg = r.get("aircraft_registration") or ""
        print(f"{fn:8s} GCI ->{arr:<6s} dep {sdep}  {st:15s}  +{dly}m  {reg}")


def flight(fn: str, date: str = "2026-06-12"):
    data = api("/api/debug/sql", body={
        "sql": f"SELECT * FROM flights WHERE flight_number = '{fn}' AND flight_date = '{date}'"
    })
    print(json.dumps(data.get("rows", []), indent=2, default=str))


def positions():
    data = api("/api/debug/positions")
    for r in data.get("rows", []):
        if r.get("onGround"):
            continue
        reg = r.get("registration", "?")
        cs = r.get("callsign", "?")
        lat = r.get("lat", 0)
        lon = r.get("lon", 0)
        alt = r.get("altitudeFt", 0)
        gs = r.get("groundSpeedKts", 0)
        hdg = r.get("heading", 0)
        eta = (r.get("eta") or "")[:16]
        print(f"{cs:10s} {reg:8s}  {lat:7.2f} {lon:7.2f}  alt={alt:5d}ft  gs={gs:3d}kts  hdg={hdg:3d}  eta={eta}")


def aircraft(reg: str):
    data = api("/api/debug/positions")
    for r in data.get("rows", []):
        if r.get("registration", "").upper() == reg.upper():
            print(json.dumps(r, indent=2, default=str))


def scrapers():
    data = api("/api/debug/scrapers")
    for r in data.get("rows", []):
        svc = r.get("service", "?")
        st = r.get("status", "?")
        n = r.get("recordsScraped", 0)
        err = r.get("errorMessage") or ""
        started = (r.get("startedAt") or "?")[:19]
        done = (r.get("completedAt") or "?")[:19]
        print(f"{svc:20s} {st:10s}  records={n:3d}  started={started}  done={done}  {err}")


def weather(code: str = "GCI"):
    data = api("/api/debug/sql", body={
        "sql": f"SELECT * FROM weather WHERE airport_code = '{code}' ORDER BY timestamp DESC LIMIT 20"
    })
    for r in data.get("rows", []):
        ts = (r.get("timestamp") or "?")[:16]
        wsp = r.get("wind_speed", "?")
        wdir = r.get("wind_direction", "?")
        vis = r.get("visibility", "?")
        cc = r.get("cloud_cover", "?")
        wc = r.get("weather_code", "?")
        print(f"{ts}  wind={wsp}kts@{wdir}  vis={vis}sm  clouds={cc}%  code={wc}")


def health():
    result = subprocess.run(["curl", "-s", f"{BASE}/api/health/timezone"], capture_output=True, text=True)
    print(json.dumps(json.loads(result.stdout), indent=2))


def run_sql(query: str):
    data = api("/api/debug/sql", body={"sql": query})
    print(json.dumps(data.get("rows", []), indent=2, default=str))


def help_text():
    print("""airways-cli — quick access to airways.gg API

Commands:
  flights [date]        List all flights
  today [date]          Compact today's schedule
  arrivals [date]       Today's arrivals at GCI
  departures [date]     Today's departures from GCI
  flight <num> [date]   Full details for a single flight
  positions             Airborne aircraft from FlightRadar24
  aircraft <reg>        Track a specific aircraft
  scrapers              Scraper run status
  weather [code]        Weather forecast (default: GCI)
  health                API health check
  sql <query>           Run arbitrary SQL
""")


if __name__ == "__main__":
    args = sys.argv[1:]
    cmd = args[0] if args else "help"

    match cmd:
        case "flights":     flights()
        case "today":       today(args[1] if len(args) > 1 else "2026-06-12")
        case "arrivals":    arrivals(args[1] if len(args) > 1 else "2026-06-12")
        case "departures":  departures(args[1] if len(args) > 1 else "2026-06-12")
        case "flight":      flight(args[1], args[2] if len(args) > 2 else "2026-06-12")
        case "positions":   positions()
        case "aircraft":    aircraft(args[1] if len(args) > 1 else "")
        case "scrapers":    scrapers()
        case "weather":     weather(args[1] if len(args) > 1 else "GCI")
        case "health":      health()
        case "sql":         run_sql(" ".join(args[1:]))
        case _:             help_text()
