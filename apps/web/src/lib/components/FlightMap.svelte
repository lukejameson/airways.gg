<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { airportName, getAirportCoords } from '$lib/airports';

  interface Props {
    lat: number;
    lon: number;
    heading: number;
    originIata: string | null;
    destIata: string | null;
    depAirport: string;
    arrAirport: string;
  }

  let { lat, lon, heading, originIata: _originIata, destIata: _destIata, depAirport, arrAirport }: Props = $props();



  let mapEl: HTMLDivElement;
  let mapInstance: import('leaflet').Map | undefined;

  onMount(async () => {
    // Dynamic import — Leaflet can't run during SSR
    const L = await import('leaflet');
    await import('leaflet/dist/leaflet.css');

    // No default icon needed — all markers use inline SVG divIcons (no CDN requests)

    mapInstance = L.map(mapEl, { zoomControl: true, attributionControl: true });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(mapInstance);

    const depCoords = getAirportCoords(depAirport);
    const arrCoords = getAirportCoords(arrAirport);
    const aircraftCoords: [number, number] = [lat, lon];

    if (depCoords && arrCoords) {
      // Full planned route (dashed)
      L.polyline([depCoords, arrCoords], {
        color: '#94a3b8',
        weight: 1.5,
        dashArray: '6 4',
        opacity: 0.6,
      }).addTo(mapInstance);

      // Flown portion (solid)
      L.polyline([depCoords, aircraftCoords], {
        color: '#3b82f6',
        weight: 2.5,
        opacity: 0.9,
      }).addTo(mapInstance);

      // Airport markers
      const airportIcon = L.divIcon({
        html: '<div style="width:8px;height:8px;background:#64748b;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
        iconSize: [8, 8],
        iconAnchor: [4, 4],
        className: '',
      });
      L.marker(depCoords, { icon: airportIcon }).bindTooltip(`${airportName(depAirport)} (${depAirport})`, { permanent: false }).addTo(mapInstance);
      L.marker(arrCoords, { icon: airportIcon }).bindTooltip(`${airportName(arrAirport)} (${arrAirport})`, { permanent: false }).addTo(mapInstance);
    }

    // Aircraft marker — rotated plane SVG
    const planeSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
           style="transform:rotate(${heading}deg);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
        <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"
              fill="#2563eb" stroke="white" stroke-width="0.5"/>
      </svg>`;

    const planeIcon = L.divIcon({
      html: planeSvg,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      className: '',
    });

    L.marker(aircraftCoords, { icon: planeIcon })
      .bindPopup(`<b>${airportName(depAirport)} (${depAirport}) → ${airportName(arrAirport)} (${arrAirport})</b><br>${lat!.toFixed(4)}, ${lon!.toFixed(4)}`)
      .addTo(mapInstance);

    // Fit map to show the whole route
    const points: [number, number][] = [aircraftCoords];
    if (depCoords)  points.push(depCoords);
    if (arrCoords)  points.push(arrCoords);
    mapInstance.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  });

  onDestroy(() => {
    mapInstance?.remove();
  });
</script>

<div bind:this={mapEl} class="h-72 w-full rounded-lg overflow-hidden border border-border z-0"></div>
