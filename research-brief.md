# Research Brief: Migrate FlightMap from Leaflet to MapLibre GL with roads.gg-style OSM

**Date:** 2026-06-02
**Status:** ready-for-planning
**Handoff target:** plan-first skill

## Goal

Replace Leaflet with MapLibre GL in `FlightMap.svelte`, using the same vector-tile map style as roads.gg.

## Context

airways.gg is a SvelteKit 5 monorepo. The web app (`apps/web/`) uses **Leaflet 1.9.4** with raster OSM tiles (`tile.openstreetmap.org`) for the flight tracking map. The map is a 288px, collapsible component on the flight detail page (`/flights/[id]`). It draws a dashed planned route, a solid flown route, airport markers, and a heading-rotated aircraft marker.

roads.gg — one directory over — is also a SvelteKit app using **MapLibre GL 5.17.0** with a custom `map-style.json` served from `static/`. That style uses OpenFreeMap's vector tile endpoint (`tiles.openfreemap.org/planet`), a muted beige/brown/blue pallete, white roads with grey casings, and no POI labels. It renders beautifully, is free, and requires no API key.

The user wants the same map style for airways.gg, keeping the existing component size and layout. No extra features (no custom zoom controls, no offline caching, no location tracking) — just the library swap and an animated plane marker.

## Alternatives Considered

### Option A: MapLibre GL with roads.gg style (Recommended)

- **Description:** Add `maplibre-gl` dependency, copy `map-style.json` to `apps/web/static/`, rewrite `FlightMap.svelte` to use the MapLibre GL imperative API. The component remains the same size (h-72 / 288px) and collapsible.
- **Pros:**
  - Same clean, professional look as roads.gg
  - Vector tiles are smaller and faster than raster tiles
  - Free tile source, no API key needed
  - MapLibre has smooth `flyTo` / `easeTo` for plane animation
  - CSS marker transitions for smooth heading changes
- **Cons:**
  - ~30% larger bundle than Leaflet (~200KB vs ~150KB gzipped)
  - Different imperative API — rewrite all marker/line logic
  - Must handle SSR (MapLibre needs `browser` guard, same as Leaflet)
- **Best for:** This exact use case — a clean, modern map with the same style as the sibling project.

### Option B: Keep Leaflet, switch to MapLibre/vector tile source via plugin

- **Description:** Keep Leaflet but use `maplibre-gl-leaflet` to render MapLibre vector tiles as a Leaflet layer.
- **Pros:** Minimal code changes to FlightMap.svelte
- **Cons:**
  - Extra dependency (`maplibre-gl-leaflet`) with 3 years of stale maintenance
  - Still ships both Leaflet (~150KB) and MapLibre (~200KB) — largest bundle
  - Cannot use MapLibre's native animation primitives
  - Brittle integration layer
- **Best for:** Not recommended — worse bundle size with worse developer experience.

### Option C: Do nothing

- **Description:** Keep Leaflet with raster OSM tiles. Replace style by switching to a different tile provider URL or adding a CSS filter.
- **Pros:** Zero code changes, zero risk
- **Cons:** Raster tiles are pixelated at high zoom, slower to load, no smooth vector-tile zoom, doesn't match roads.gg's look
- **Best for:** If the perceived benefit isn't worth the ~2-hour migration effort.

## Recommendation

**Option A — MapLibre GL with roads.gg style.** The tile source and style file are already proven in roads.gg, the dependency is well-maintained (v5.x), and the FlightMap component is self-contained (one file to rewrite, ~100 lines of Leaflet logic). The migration is low-risk: MapLibre also needs a browser-only dynamic import, same as the current Leaflet setup.

The user explicitly ruled out custom zoom controls, offline caching, and location tracking — so this stays a straightforward library swap. The animated plane marker can be achieved with CSS `transition` on the marker element's `transform` property when heading changes, plus MapLibre's `flyTo` for smooth map centering.

## Key Findings

- **roads.gg's `map-style.json`** is standalone — it references `tiles.openfreemap.org` for both vector tiles and glyphs/sprites. No secrets, no environment variables. It can be copied verbatim.
- **OpenFreeMap** (openfreemap.org) is a free, community-maintained tile service built on OpenMapTiles. No API key or registration required.
- **MapLibre GL 5.17.0** is the same version roads.gg uses. Its CSS must be imported: `import 'maplibre-gl/dist/maplibre-gl.css'`.
- **FlightMap.svelte** is only used on the flight detail page and loads dynamically (`import('$lib/components/FlightMap.svelte')`). The parent page guards with `browser` before mounting.
- **vite.config.ts** currently has `manualChunks` for Leaflet — this can be updated to handle `maplibre-gl` instead.
- **MapLibre bundles its own web worker** — Vite handles this automatically; no special config needed.

## Open Questions

- None — scope is well-defined.

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| MapLibre GL CSS conflicts with existing Tailwind styles | low | Test in dev; MapLibre CSS is namespaced under `.maplibregl-*` prefixes |
| Vector tiles fail to load (OpenFreeMap outage) | low | Same risk as current raster tiles; OpenFreeMap has been reliable for roads.gg |
| Bundle size increase | low | MapLibre is ~50KB larger than Leaflet gzipped. Dynamic import keeps it out of initial bundle. Acceptable trade-off. |

## Implementation Hints

1. **Dependency changes** in `apps/web/package.json`: remove `leaflet` and `@types/leaflet`, add `maplibre-gl` (`^5.17.0`)
2. **Copy** `roads.gg/static/map-style.json` → `airways.gg/apps/web/static/map-style.json`
3. **Rewrite** `FlightMap.svelte` — the Leaflet-to-MapLibre mapping:
   - `L.map(el, {...})` → `new maplibregl.Map({container: el, style: '/map-style.json', ...})`
   - `L.tileLayer(...)` → not needed (style defines tiles)
   - `L.polyline(coords, {...})` → `map.addSource(...)` + `map.addLayer({type: 'line', ...})`
   - `L.marker(coords, {icon})` → `new maplibregl.Marker({element, anchor}).setLngLat(coords).addTo(map)`
   - `L.latLngBounds(points)` / `fitBounds()` → `map.fitBounds(bbox, {padding})` — compute bbox from coords
4. **Animation**: wrap the aircraft marker element in CSS `transition: transform 0.3s ease` so heading changes animate smoothly. Re-set marker position on a short interval for movement illusion, or simply let MapLibre's `flyTo` handle smooth centering.
5. **Update `vite.config.ts`**: remove Leaflet `manualChunks` entry, add `maplibre-gl` if desired (optional — MapLibre handles its own chunking).

---

*Generated by research-assistant skill v1.0.0*
*To proceed, invoke the plan-first skill with this brief as context.*
