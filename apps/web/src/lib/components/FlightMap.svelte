<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { airportName, getAirportCoords } from '$lib/airports';

  interface Props {
    lat: number;
    lon: number;
    heading: number;
    depAirport: string;
    arrAirport: string;
  }

  let { lat, lon, heading, depAirport, arrAirport }: Props = $props();

  let mapEl: HTMLDivElement;
  let mapInstance: maplibregl.Map | undefined;
  let planeMarker: maplibregl.Marker | undefined;

  onMount(() => {
    mapInstance = new maplibregl.Map({
      container: mapEl,
      style: '/map-style.json',
      attributionControl: true,
    });

    mapInstance.on('load', () => {
      if (!mapInstance) return;

      const depCoords = getAirportCoords(depAirport);
      const arrCoords = getAirportCoords(arrAirport);
      const aircraftCoords: [number, number] = [lon, lat];

      // Build bounds for fitBounds
      const points: [number, number][] = [aircraftCoords];
      if (depCoords) points.push([depCoords[1], depCoords[0]]);
      if (arrCoords) points.push([arrCoords[1], arrCoords[0]]);

      if (depCoords && arrCoords) {
        // Full planned route (dashed)
        mapInstance.addSource('planned-route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [depCoords[1], depCoords[0]],
                [arrCoords[1], arrCoords[0]],
              ],
            },
          },
        });
        mapInstance.addLayer({
          id: 'planned-route-line',
          type: 'line',
          source: 'planned-route',
          paint: {
            'line-color': '#94a3b8',
            'line-width': 1.5,
            'line-dasharray': [3, 2],
            'line-opacity': 0.6,
          },
        });

        // Flown portion (solid)
        mapInstance.addSource('flown-route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [depCoords[1], depCoords[0]],
                aircraftCoords,
              ],
            },
          },
        });
        mapInstance.addLayer({
          id: 'flown-route-line',
          type: 'line',
          source: 'flown-route',
          paint: {
            'line-color': '#3b82f6',
            'line-width': 2.5,
            'line-opacity': 0.9,
          },
        });

        // Airport markers
        const airportEl = (tooltip: string) => {
          const el = document.createElement('div');
          el.innerHTML = `<div style="width:8px;height:8px;background:#64748b;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`;
          return el;
        };

        new maplibregl.Marker({ element: airportEl(`${airportName(depAirport)} (${depAirport})`), anchor: 'center' })
          .setLngLat([depCoords[1], depCoords[0]])
          .setPopup(new maplibregl.Popup().setText(`${airportName(depAirport)} (${depAirport})`))
          .addTo(mapInstance);

        new maplibregl.Marker({ element: airportEl(`${airportName(arrAirport)} (${arrAirport})`), anchor: 'center' })
          .setLngLat([arrCoords[1], arrCoords[0]])
          .setPopup(new maplibregl.Popup().setText(`${airportName(arrAirport)} (${arrAirport})`))
          .addTo(mapInstance);
      }

      // Aircraft marker — rotated plane SVG
      const planeEl = document.createElement('div');
      planeEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
             style="transform:rotate(${heading}deg);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));transition:transform 0.6s ease">
          <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"
                fill="#2563eb" stroke="white" stroke-width="0.5"/>
        </svg>`;

      planeMarker = new maplibregl.Marker({ element: planeEl, anchor: 'center' })
        .setLngLat(aircraftCoords)
        .setPopup(
          new maplibregl.Popup().setHTML(
            `<b>${airportName(depAirport)} (${depAirport}) → ${airportName(arrAirport)} (${arrAirport})</b><br>${lat.toFixed(4)}, ${lon.toFixed(4)}`
          )
        )
        .addTo(mapInstance);

      // Fit map to show the whole route
      if (points.length >= 2) {
        const lngs = points.map(p => p[0]);
        const lats = points.map(p => p[1]);
        const bounds: [[number, number], [number, number]] = [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ];
        mapInstance.fitBounds(bounds, { padding: 40 });
      }
    });
  });

  onDestroy(() => {
    planeMarker?.remove();
    mapInstance?.remove();
  });
</script>

<div bind:this={mapEl} class="h-72 w-full rounded-lg overflow-hidden border border-border z-0"></div>

<style>
  :global(.maplibregl-popup-content) {
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    font-size: 0.875rem;
  }
  :global(.maplibregl-ctrl-attrib) {
    font-size: 0.65rem;
  }
</style>
