<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page, navigating } from '$app/stores';
  import { slide } from 'svelte/transition';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const WX_LABELS: Record<number, string> = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Icy fog',
    51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
    61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
    71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
    80: 'Slight showers', 81: 'Moderate showers', 82: 'Heavy showers',
    95: 'Thunderstorm',
  };

  function n(v: unknown): number { return Number(v) || 0; }
  function nav(href: string) { goto(href); }

  const FREETEXT_NAMES: Record<string, string> = {
    GRANCANAR: 'Gran Canaria', GRENOBLE: 'Grenoble', MALAGA: 'Málaga',
    BELGIUM: 'Belgium', 'SPAIN(CAN': 'Spain (Canaries)',
    LONDONSTA: 'London Stansted', NEWCASTLE: 'Newcastle',
  };
  function airportName(code: string): string {
    if (FREETEXT_NAMES[code]) return FREETEXT_NAMES[code];
    const rec = (data.airports as Record<string, { name: string } | undefined>)[code];
    if (rec?.name) return rec.name.replace(/\s+(International\s+)?Airport$/i, '').trim();
    return code;
  }
  function fmtRoute(dep: string, arr: string): string {
    return `${airportName(dep)} → ${airportName(arr)}`;
  }
  function fmt(mins: unknown): string {
    const m = Number(mins);
    if (!m || m <= 0) return '—';
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (h > 0 && rem > 0) return `${h}h ${rem}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }
  function fmtDate(d: unknown): string {
    if (!d) return '—';
    const s = String(d).slice(0, 10); // "YYYY-MM-DD" — strip time/tz before parsing
    const [y, m, day] = s.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function delayColor(pct: unknown): string {
    const p = Number(pct) || 0;
    if (p < 20) return 'text-green-600';
    if (p < 50) return 'text-amber-600';
    return 'text-red-600';
  }
  function reliabilityBadge(score: unknown): string {
    const s = Number(score) || 0;
    if (s < 20) return 'bg-green-100 text-green-700';
    if (s < 50) return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  }
  function cellBg(pct: unknown): string {
    const p = Math.min(Number(pct) || 0, 100);
    return `background: hsl(0 84% 60% / ${(p / 100) * 0.18})`;
  }
  function degToCardinal(deg: unknown): string {
    const d = Number(deg) || 0;
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round((d % 360) / 22.5) % 16];
  }
  function xwBandColor(bandKey: unknown): string {
    const b = String(bandKey);
    if (b.includes('>dry limit')) return 'text-red-600 font-medium';
    if (b.includes('>wet limit')) return 'text-amber-600 font-medium';
    return '';
  }

  const hero = $derived(data.heroStats);
  const dist = $derived(data.delayDistribution);

  const totalFlights = $derived(n(hero.total_flights));
  const totalCancelled = $derived(n(hero.total_cancelled));
  const cancelPct = $derived(totalFlights ? ((totalCancelled / totalFlights) * 100).toFixed(1) : '0');
  const onTimePct = $derived((() => {
    const withOutcome = n(hero.with_outcome);
    return withOutcome ? ((n(hero.on_time) / withOutcome) * 100).toFixed(1) : '0';
  })());
  const avgDelay = $derived(n(hero.avg_delay_mins));
  const earliestDate = $derived(fmtDate(hero.earliest_date));
  const latestDate = $derived(fmtDate(hero.latest_date));

  const bestDay = $derived.by(() => {
    const days = data.dayOfWeek as Record<string, unknown>[];
    if (!days.length) return null;
    return [...days].sort((a, b) => {
      const aScore = (n(a.avg_delay) * 0.5) + (n(a.cancelled) / Math.max(n(a.flights), 1) * 100 * 0.5);
      const bScore = (n(b.avg_delay) * 0.5) + (n(b.cancelled) / Math.max(n(b.flights), 1) * 100 * 0.5);
      return aScore - bScore;
    })[0];
  });
  const worstDay = $derived.by(() => {
    const days = data.dayOfWeek as Record<string, unknown>[];
    if (!days.length) return null;
    return [...days].sort((a, b) => {
      const aScore = (n(a.avg_delay) * 0.5) + (n(a.cancelled) / Math.max(n(a.flights), 1) * 100 * 0.5);
      const bScore = (n(b.avg_delay) * 0.5) + (n(b.cancelled) / Math.max(n(b.flights), 1) * 100 * 0.5);
      return bScore - aScore;
    })[0];
  });

  const distTotal = $derived(
    n(dist.on_time) + n(dist.d1_15) + n(dist.d16_30) + n(dist.d31_60) + n(dist.d1_2h) + n(dist.d2hplus) + n(dist.cancelled)
  );

  function routeKey(r: Record<string, unknown>): string {
    return `${r.departure_airport}-${r.arrival_airport}`;
  }

  // Filters come from URL params — server re-runs all queries on change
  const filterRoute     = $derived(data.activeRoute     || null);
  const filterAirline   = $derived(data.activeAirline   || null);
  const filterDirection = $derived(data.activeDirection || null);
  const filterDow       = $derived(data.activeDow       || null);
  const filterSeason    = $derived(data.activeSeason    || null);
  const filterMonth     = $derived(data.activeMonth     || null);
  const filterYear      = $derived(data.activeYear      || null);
  const filterThreshold = $derived(data.threshold ?? 15);
  
  // Airline options: All, Aurigny, British Airways, Loganair
  const AIRLINE_OPTIONS = [
    ['', 'All'],
    ['GR', 'Aurigny'],
    ['BA', 'British Airways'],
    ['LM', 'Loganair']
  ] as const;

  function filterUrl(updates: Record<string, string | null>): string {
    const p = new URLSearchParams($page.url.searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') p.delete(k); else p.set(k, v);
    }
    return `/stats?${p}`;
  }

  function setRouteFilter(key: string) {
    goto(filterUrl({ route: filterRoute === key ? null : key }), { noScroll: true });
  }
  function clearAllFilters() {
    goto(filterUrl({ route: null, airline: null, direction: null, dow: null, season: null, month: null, year: null, threshold: null }), { noScroll: true });
  }
  const activeFilterCount = $derived([
    filterAirline, filterRoute, filterDirection, filterDow,
    filterSeason, filterMonth, filterYear, filterThreshold !== 15 ? 'thr' : null,
  ].filter(Boolean).length);
  const hasActiveFilters = $derived(activeFilterCount > 0);

  let panelOpen = $state(false);

  const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  type SortDir = 'asc' | 'desc';
  let routeSort = $state<{ col: string; dir: SortDir }>({ col: 'avg_delay', dir: 'desc' });
  let flightSort = $state<{ col: string; dir: SortDir }>({ col: 'delay_pct', dir: 'desc' });

  function toggleSort(current: { col: string; dir: SortDir }, col: string): { col: string; dir: SortDir } {
    if (current.col === col) return { col, dir: current.dir === 'desc' ? 'asc' : 'desc' };
    return { col, dir: 'desc' };
  }

  const sortedRoutes = $derived.by(() => {
    const rows = [...(data.worstRoutes as Record<string, unknown>[])];
    const { col, dir } = routeSort;
    return rows.sort((a, b) => {
      const av = Number(a[col]) || 0;
      const bv = Number(b[col]) || 0;
      return dir === 'desc' ? bv - av : av - bv;
    });
  });

  const sortedFlights = $derived.by(() => {
    const rows = [...(data.flightNumbers as Record<string, unknown>[])];
    const { col, dir } = flightSort;
    return rows.sort((a, b) => {
      const av = Number(a[col]) || 0;
      const bv = Number(b[col]) || 0;
      return dir === 'desc' ? bv - av : av - bv;
    });
  });

  function sortIcon(current: { col: string; dir: SortDir }, col: string): string {
    if (current.col !== col) return '↕';
    return current.dir === 'desc' ? '↓' : '↑';
  }

  let trendCanvas = $state<HTMLCanvasElement | undefined>();
  let dowCanvas = $state<HTMLCanvasElement | undefined>();
  let hourCanvas = $state<HTMLCanvasElement | undefined>();
  let distCanvas = $state<HTMLCanvasElement | undefined>();

  $effect(() => {
    if (!browser || !trendCanvas) return;
    const canvas = trendCanvas;
    const rows = data.dailyOtp as Record<string, unknown>[];
    let chart: import('chart.js').Chart | null = null;
    import('chart.js/auto').then(({ Chart }) => {
      Chart.defaults.font.family = 'Space Grotesk, system-ui, sans-serif';
      Chart.defaults.font.size = 11;
      const style = getComputedStyle(document.documentElement);
      const primary = `hsl(${style.getPropertyValue('--primary').trim()})`;
      const destructive = `hsl(${style.getPropertyValue('--destructive').trim()})`;
      const mutedFg = `hsl(${style.getPropertyValue('--muted-foreground').trim()})`;
      const border = `hsl(${style.getPropertyValue('--border').trim()})`;
      chart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: rows.map(r => {
            const d = new Date(String(r.flight_date));
            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          }),
          datasets: [
            {
              label: 'On-time %',
              data: rows.map(r => Number(r.otp_pct) || 0),
              borderColor: primary,
              backgroundColor: primary.replace(')', ' / 0.1)').replace('hsl(', 'hsl('),
              fill: true,
              tension: 0.3,
              pointRadius: 3,
              borderWidth: 2,
            },
            {
              label: 'Cancellation %',
              data: rows.map(r => Number(r.cancel_pct) || 0),
              borderColor: destructive,
              backgroundColor: 'transparent',
              fill: false,
              tension: 0.3,
              pointRadius: 3,
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: mutedFg, boxWidth: 12, padding: 16 } },
            tooltip: { backgroundColor: '#fff', titleColor: '#111', bodyColor: '#555', borderColor: border, borderWidth: 1 },
          },
          scales: {
            x: { ticks: { color: mutedFg, maxTicksLimit: 10 }, grid: { color: border } },
            y: { min: 0, max: 100, ticks: { color: mutedFg, callback: v => `${v}%` }, grid: { color: border } },
          },
        },
      });
    });
    return () => { chart?.destroy(); };
  });

  $effect(() => {
    if (!browser || !dowCanvas) return;
    const canvas = dowCanvas;
    const rows = data.dayOfWeek as Record<string, unknown>[];
    let chart: import('chart.js').Chart | null = null;
    import('chart.js/auto').then(({ Chart }) => {
      const style = getComputedStyle(document.documentElement);
      const destructive = `hsl(${style.getPropertyValue('--destructive').trim()})`;
      const mutedFg = `hsl(${style.getPropertyValue('--muted-foreground').trim()})`;
      const border = `hsl(${style.getPropertyValue('--border').trim()})`;
      const labels = rows.map(r => String(r.day_name).trim().slice(0, 3));
      const delays = rows.map(r => Number(r.avg_delay) || 0);
      const maxDelay = Math.max(...delays, 1);
      const barColors = delays.map(d => {
        const ratio = d / maxDelay;
        if (ratio < 0.4) return 'hsl(160 84% 39% / 0.8)';
        if (ratio < 0.7) return 'hsl(38 92% 50% / 0.8)';
        return 'hsl(0 84% 60% / 0.8)';
      });
      chart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Avg delay (min)',
              data: delays,
              backgroundColor: barColors,
              borderRadius: 4,
              yAxisID: 'y',
            },
            {
              label: 'Cancellations',
              data: rows.map(r => Number(r.cancelled) || 0),
              backgroundColor: destructive.replace(')', ' / 0.25)').replace('hsl(', 'hsl('),
              borderColor: destructive.replace(')', ' / 0.6)').replace('hsl(', 'hsl('),
              borderWidth: 1,
              borderRadius: 4,
              yAxisID: 'y2',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: mutedFg, boxWidth: 12, padding: 16 } },
            tooltip: { backgroundColor: '#fff', titleColor: '#111', bodyColor: '#555', borderColor: border, borderWidth: 1 },
          },
          scales: {
            x: { ticks: { color: mutedFg }, grid: { color: border } },
            y: { ticks: { color: mutedFg }, grid: { color: border }, title: { display: true, text: 'Avg delay (min)', color: mutedFg } },
            y2: { position: 'right', ticks: { color: mutedFg }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Cancellations', color: mutedFg } },
          },
        },
      });
    });
    return () => { chart?.destroy(); };
  });

  $effect(() => {
    if (!browser || !hourCanvas) return;
    const canvas = hourCanvas;
    const rows = data.departureHour as Record<string, unknown>[];
    let chart: import('chart.js').Chart | null = null;
    import('chart.js/auto').then(({ Chart }) => {
      const style = getComputedStyle(document.documentElement);
      const mutedFg = `hsl(${style.getPropertyValue('--muted-foreground').trim()})`;
      const border = `hsl(${style.getPropertyValue('--border').trim()})`;
      const delays = rows.map(r => Number(r.avg_delay) || 0);
      const maxDelay = Math.max(...delays, 1);
      chart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: rows.map(r => `${String(r.hour).padStart(2, '0')}:00`),
          datasets: [{
            label: 'Avg delay (min)',
            data: delays,
            backgroundColor: delays.map(d => {
              const ratio = d / maxDelay;
              if (ratio < 0.4) return 'hsl(160 84% 39% / 0.8)';
              if (ratio < 0.7) return 'hsl(38 92% 50% / 0.8)';
              return 'hsl(0 84% 60% / 0.8)';
            }),
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#fff', titleColor: '#111', bodyColor: '#555', borderColor: border, borderWidth: 1,
              callbacks: {
                afterBody: (items) => {
                  const idx = items[0]?.dataIndex;
                  const row = rows[idx];
                  if (!row) return '';
                  return `${row.flights} flights · ${row.delayed} delayed`;
                },
              },
            },
          },
          scales: {
            x: { ticks: { color: mutedFg, maxRotation: 45 }, grid: { color: border } },
            y: { ticks: { color: mutedFg }, grid: { color: border }, title: { display: true, text: 'Avg delay (min)', color: mutedFg } },
          },
        },
      });
    });
    return () => { chart?.destroy(); };
  });

  $effect(() => {
    if (!browser || !distCanvas) return;
    const canvas = distCanvas;
    const d = data.delayDistribution as Record<string, unknown>;
    let chart: import('chart.js').Chart | null = null;
    import('chart.js/auto').then(({ Chart }) => {
      const style = getComputedStyle(document.documentElement);
      const mutedFg = `hsl(${style.getPropertyValue('--muted-foreground').trim()})`;
      const border = `hsl(${style.getPropertyValue('--border').trim()})`;
      chart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: [''],
          datasets: [
            { label: 'On-time (≤15 min)', data: [n(d.on_time)], backgroundColor: 'hsl(160 84% 39% / 0.85)', borderRadius: 4 },
            { label: '1–15 min', data: [n(d.d1_15)], backgroundColor: 'hsl(38 92% 50% / 0.7)', borderRadius: 0 },
            { label: '16–30 min', data: [n(d.d16_30)], backgroundColor: 'hsl(30 92% 50% / 0.8)', borderRadius: 0 },
            { label: '31–60 min', data: [n(d.d31_60)], backgroundColor: 'hsl(0 84% 60% / 0.7)', borderRadius: 0 },
            { label: '1–2 hours', data: [n(d.d1_2h)], backgroundColor: 'hsl(0 84% 45% / 0.8)', borderRadius: 0 },
            { label: '2+ hours', data: [n(d.d2hplus)], backgroundColor: 'hsl(0 84% 30% / 0.9)', borderRadius: 0 },
            { label: 'Cancelled', data: [n(d.cancelled)], backgroundColor: 'hsl(215 20% 60% / 0.6)', borderRadius: 4 },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: mutedFg, boxWidth: 12, padding: 12, font: { size: 11 } } },
            tooltip: { backgroundColor: '#fff', titleColor: '#111', bodyColor: '#555', borderColor: border, borderWidth: 1 },
          },
          scales: {
            x: { stacked: true, ticks: { color: mutedFg }, grid: { color: border } },
            y: { stacked: true, ticks: { display: false }, grid: { display: false } },
          },
        },
      });
    });
    return () => { chart?.destroy(); };
  });

  const currentRange = $derived($page.url.searchParams.get('range') ?? '90');
  const isLoading = $derived(!!$navigating && $navigating.to?.url.pathname === '/stats');
  const sk = 'animate-pulse rounded bg-muted';

  let routeSearch = $state('');
  let routeInputElement: HTMLInputElement | undefined = $state();

  const topRouteOptions = $derived.by(() => {
    const routes = data.availableRoutes as { departure: string; arrival: string; key: string }[];
    return routes.slice(0, 10);
  });

  const otherRoutes = $derived.by(() => {
    const routes = data.availableRoutes as { departure: string; arrival: string; key: string }[];
    const others = routes.slice(10);
    if (!routeSearch) return others;
    const searchUpper = routeSearch.toUpperCase();
    return others.filter(r => {
      const codes = `${r.departure}${r.arrival}`.toUpperCase();
      const names = `${airportName(r.departure)} ${airportName(r.arrival)}`.toUpperCase();
      return codes.includes(searchUpper) || names.includes(searchUpper);
    });
  });

  function selectRoute(key: string) {
    setRouteFilter(key);
    routeSearch = '';
    if (routeInputElement) routeInputElement.blur();
  }

  type InsightTone = 'green' | 'amber' | 'red' | 'neutral';
  interface Insight {
    label: string;
    value: string;
    sub: string;
    tone: InsightTone;
  }

  const insights = $derived.by((): Insight[] => {
    const list: Insight[] = [];
    const cpct = Number(cancelPct);
    const otp = Number(onTimePct);

    list.push({
      label: 'On-time rate',
      value: `${onTimePct}%`,
      sub: otp >= 80 ? 'Of flights with outcome data' : otp >= 60 ? 'Roughly 1 in 3 flights delayed' : 'Over half of flights delayed',
      tone: otp >= 80 ? 'green' : otp >= 60 ? 'amber' : 'red',
    });

    list.push({
      label: 'Cancellation rate',
      value: `${cancelPct}%`,
      sub: cpct >= 20 ? `1 in ${Math.round(100 / cpct)} flights cancelled` : cpct >= 10 ? 'Slightly elevated — check dates' : `${totalCancelled} total cancellations`,
      tone: cpct >= 20 ? 'red' : cpct >= 10 ? 'amber' : 'green',
    });

    if (avgDelay > 0) {
      list.push({
        label: 'Avg delay when late',
        value: fmt(avgDelay),
        sub: avgDelay >= 120 ? 'Significant disruption expected' : avgDelay >= 45 ? 'Worth monitoring on the day' : 'Usually minor disruption',
        tone: avgDelay >= 120 ? 'red' : avgDelay >= 45 ? 'amber' : 'green',
      });
    }

    if (bestDay) {
      list.push({
        label: 'Best day to fly',
        value: String(bestDay.day_name).trim(),
        sub: `${fmt(bestDay.avg_delay)} avg delay · ${bestDay.cancelled} cancellations`,
        tone: 'green',
      });
    }

    if (worstDay) {
      list.push({
        label: 'Most disrupted day',
        value: String(worstDay.day_name).trim(),
        sub: `${fmt(worstDay.avg_delay)} avg delay · ${worstDay.cancelled} cancellations`,
        tone: 'red',
      });
    }

    const topRoute = (data.worstRoutes as Record<string, unknown>[]).find(r => n(r.flights) >= 10 && n(r.avg_delay) > 0);
    if (topRoute) {
      list.push({
        label: 'Most delayed route',
        value: fmtRoute(String(topRoute.departure_airport), String(topRoute.arrival_airport)),
        sub: `${fmt(topRoute.avg_delay)} avg · ${topRoute.delay_pct}% delay rate`,
        tone: 'amber',
      });
    }

    const fogRow = (data.visibilityDelays as Record<string, unknown>[]).find(r => String(r.vis_band).startsWith('<1'));
    if (fogRow && n(fogRow.flights) > 0) {
      list.push({
        label: 'Fog impact',
        value: `${fogRow.delay_pct}% delayed`,
        sub: `${fogRow.flights} flights in fog · ${fogRow.cancelled} cancelled`,
        tone: 'red',
      });
    }

    const worstWind = [...(data.windDelays as Record<string, unknown>[])].sort((a, b) => n(b.avg_delay) - n(a.avg_delay))[0];
    if (worstWind && n(worstWind.avg_delay) > 0) {
      list.push({
        label: 'Wind impact',
        value: fmt(worstWind.avg_delay),
        sub: `Avg delay in ${worstWind.wind_band} winds`,
        tone: 'amber',
      });
    }

    return list;
  });

  function fmtBig(v: number): string {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}m`;
    if (v >= 10_000) return `${Math.round(v / 1_000)}k`;
    return v.toLocaleString();
  }
  function fmtMoney(v: number): string {
    if (v >= 1_000_000) return `£${(v / 1_000_000).toFixed(1)}m`;
    if (v >= 1_000) return `£${Math.round(v / 1_000)}k`;
    return `£${v}`;
  }
  const impactData = $derived(data.delayImpact as Record<string, unknown>);
  const impactMins = $derived(n(impactData.total_delay_mins_gt5));
  const impactHours = $derived(Math.round(impactMins / 60));
  const impactDays = $derived((impactMins / 60 / 24).toFixed(1));
  // pax-weighted: ACI routes = 15 pax, all others = 50 pax (calculated server-side)
  const paxHours = $derived(Math.round(n(impactData.pax_weighted_delay_mins) / 60));
  const costLow = $derived(Math.round(paxHours * 11.5));
  const costHigh = $derived(Math.round(paxHours * 25));

  const toneClasses: Record<InsightTone, { card: string; value: string; label: string }> = {
    green:   { card: 'border-green-200 bg-green-50',   value: 'text-green-700',    label: 'text-green-600' },
    amber:   { card: 'border-amber-200 bg-amber-50',   value: 'text-amber-700',    label: 'text-amber-600' },
    red:     { card: 'border-red-200 bg-red-50',       value: 'text-red-700',      label: 'text-red-600' },
    neutral: { card: 'border-border bg-card',          value: 'text-foreground',   label: 'text-muted-foreground' },
  };
  const thBtn = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground cursor-pointer select-none whitespace-nowrap';
  const tdBase = 'px-3 py-2.5 text-sm';

  const DISCLAIMER_KEY = 'stats_disclaimer_seen';
  let showDisclaimer = $state(false);

  $effect(() => {
    if (!browser) return;
    if (!localStorage.getItem(DISCLAIMER_KEY)) {
      showDisclaimer = true;
    }
  });

  function dismissDisclaimer() {
    localStorage.setItem(DISCLAIMER_KEY, '1');
    showDisclaimer = false;
  }
</script>

<svelte:head>
  <title>Guernsey Airport Flight Statistics — Delays, Cancellations & Routes | airways.gg</title>
  <meta name="description" content="Guernsey Airport (GCI) flight statistics: on-time performance, delay rates, cancellations by route, weather impact, and monthly breakdowns for Aurigny and Blue Islands." />
  <link rel="canonical" href="{data.siteUrl}/stats" />
  <meta name="robots" content="index, follow" />
  <meta property="og:title" content="Guernsey Airport Flight Statistics | airways.gg" />
  <meta property="og:description" content="On-time rates, delay stats, cancellation data, and weather impact for Guernsey Airport (GCI) flights." />
  <meta property="og:url" content="{data.siteUrl}/stats" />
  <meta name="twitter:title" content="Guernsey Airport Flight Statistics | airways.gg" />
  <meta name="twitter:description" content="On-time rates, delay stats, cancellation data, and weather impact for Guernsey Airport (GCI) flights." />
</svelte:head>

{#if showDisclaimer}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
    <div class="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
      <h2 id="disclaimer-title" class="mb-1 text-base font-semibold text-foreground">Before you explore</h2>
      <p class="mb-4 text-sm text-muted-foreground">Please take a moment to read the following.</p>
      <ul class="mb-6 space-y-3 text-sm text-foreground">
        <li class="flex gap-2">
          <span class="mt-0.5 shrink-0 text-muted-foreground">1.</span>
          <span>This data is not 100% accurate. Records may be incomplete and outliers exist — treat all figures as indicative, not definitive.</span>
        </li>
        <li class="flex gap-2">
          <span class="mt-0.5 shrink-0 text-muted-foreground">2.</span>
          <span>This is not a witch hunt and is not intended to discredit the hard work carried out at the airport. It is purely a data analysis exercise.</span>
        </li>
      </ul>
      <button
        onclick={dismissDisclaimer}
        class="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
      >
        I understand
      </button>
    </div>
  </div>
{/if}

<div class="container max-w-5xl px-4 py-6 sm:py-8">

  <!-- Header -->
  <div class="flex flex-col gap-3 mb-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Flight Statistics</h1>
      <p class="text-sm text-muted-foreground mt-1">
        Guernsey Airport (GCI)
        {#if hero.earliest_date && hero.latest_date}· {earliestDate} – {latestDate}{/if}
        · {totalFlights.toLocaleString()} flights
      </p>
    </div>
    <div class="flex items-center self-start sm:self-auto gap-2">
      <div class="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
        {#each [['all', 'All time'], ['90', '90 days'], ['30', '30 days']] as [val, label]}
          <button onclick={() => goto(`/stats?range=${val}`, { noScroll: true })} class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap h-[36px] flex items-center {currentRange === val ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}">{label}</button>
        {/each}
      </div>
      <button
        onclick={() => panelOpen = !panelOpen}
        class="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors h-[46px] {panelOpen || hasActiveFilters ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/40 text-muted-foreground hover:text-foreground'}"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
        Filters{#if activeFilterCount > 0}&nbsp;({activeFilterCount}){/if}
      </button>
    </div>
  </div>

  <!-- Collapsible filter panel -->
  {#if panelOpen}
  <div transition:slide={{ duration: 180 }} class="rounded-xl border bg-card p-4 mb-5 space-y-4">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Airline</p>
        <div class="flex flex-wrap gap-1.5">
          {#each AIRLINE_OPTIONS as [val, label]}
            <button onclick={() => goto(filterUrl({ airline: val || null }), { noScroll: true })} class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {(val === '' ? filterAirline === null : filterAirline === val) ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}">{label}</button>
          {/each}
        </div>
      </div>
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Direction</p>
        <div class="flex flex-wrap gap-1.5">
          {#each [['', 'All'], ['dep', 'Departures'], ['arr', 'Arrivals']] as [val, label]}
            <button onclick={() => goto(filterUrl({ direction: val || null }), { noScroll: true })} class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {(val === '' ? filterDirection === null : filterDirection === val) ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}">{label}</button>
          {/each}
        </div>
      </div>
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Delay threshold (on-time)</p>
        <div class="flex flex-wrap gap-1.5">
          {#each [[0, '0 min'], [15, '15 min'], [30, '30 min']] as [val, label]}
            <button onclick={() => goto(filterUrl({ threshold: val === 15 ? null : String(val) }), { noScroll: true })} class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {filterThreshold === val ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}">{label}</button>
          {/each}
        </div>
      </div>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Route</p>
      <div class="flex flex-wrap gap-1.5 items-center">
        {#if filterRoute}
          <button onclick={() => goto(filterUrl({ route: null }), { noScroll: true })} class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors bg-primary text-primary-foreground border-primary">Clear</button>
        {/if}
        {#each topRouteOptions as route}
          <button onclick={() => setRouteFilter(route.key)} class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {filterRoute === route.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}">{fmtRoute(route.departure, route.arrival)}</button>
        {/each}
        {#if (data.availableRoutes as { departure: string; arrival: string; key: string }[]).length > 10}
          <div class="relative">
            <input
              type="text"
              placeholder="Search other routes..."
              bind:value={routeSearch}
              bind:this={routeInputElement}
              onblur={() => { routeSearch = ''; }}
              class="px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-full border border-border bg-background text-xs placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {#if routeSearch}
              <div class="absolute top-full mt-1 left-0 right-0 max-h-48 overflow-y-auto bg-background border border-border rounded-lg shadow-lg z-50 pointer-events-auto">
                {#if otherRoutes.length > 0}
                  {#each otherRoutes as route}
                    <button
                      type="button"
                      onmousedown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        selectRoute(route.key);
                      }}
                      class="w-full px-4 py-2 text-left text-xs hover:bg-muted transition-colors {filterRoute === route.key ? 'bg-muted text-primary font-medium' : ''}"
                    >
                      {fmtRoute(route.departure, route.arrival)}
                    </button>
                  {/each}
                {:else}
                  <div class="px-4 py-2 text-xs text-muted-foreground">No routes found</div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Year</p>
        <div class="flex flex-wrap gap-1.5">
          <button onclick={() => goto(filterUrl({ year: null }), { noScroll: true })} class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {filterYear === null ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}">All</button>
          {#each data.availableYears as year}
            <button onclick={() => goto(filterUrl({ year: filterYear === String(year) ? null : String(year) }), { noScroll: true })} class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {filterYear === String(year) ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}">{year}</button>
          {/each}
        </div>
      </div>
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Season</p>
        <div class="flex flex-wrap gap-1.5">
          {#each [['', 'All'], ['spring', 'Spring'], ['summer', 'Summer'], ['autumn', 'Autumn'], ['winter', 'Winter']] as [val, label]}
            <button onclick={() => goto(filterUrl({ season: val || null, month: null, range: val ? 'all' : null }), { noScroll: true })} class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {(val === '' ? filterSeason === null && filterMonth === null : filterSeason === val && filterMonth === null) ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}">{label}</button>
          {/each}
        </div>
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Month</p>
        <div class="flex flex-wrap gap-1.5">
          {#each MONTH_LABELS as label, i}
            {@const m = String(i + 1)}
            <button onclick={() => goto(filterUrl({ month: filterMonth === m ? null : m, season: null, range: filterMonth === m ? null : 'all' }), { noScroll: true })} class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {filterMonth === m ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}">{label}</button>
          {/each}
        </div>
      </div>
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Day of week</p>
        <div class="flex flex-wrap gap-1.5">
          <button onclick={() => goto(filterUrl({ dow: null }), { noScroll: true })} class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {filterDow === null ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}">All</button>
          {#each DOW_LABELS as label, i}
            <button onclick={() => goto(filterUrl({ dow: filterDow === String(i) ? null : String(i) }), { noScroll: true })} class="px-4 py-2 sm:px-2.5 sm:py-1 rounded-full border text-xs font-medium transition-colors {filterDow === String(i) ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/30'}">{label}</button>
          {/each}
        </div>
      </div>
    </div>
    {#if hasActiveFilters}
    <div class="pt-1 border-t flex justify-end">
      <button onclick={clearAllFilters} class="text-xs text-muted-foreground hover:text-foreground">Clear all filters ×</button>
    </div>
    {/if}
  </div>
  {/if}
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
    {#if isLoading}
      {#each [1,2,3,4] as _}
        <div class="rounded-xl border bg-card p-4">
          <div class="{sk} h-3 w-24 mb-3"></div>
          <div class="{sk} h-8 w-16 mb-2"></div>
          <div class="{sk} h-3 w-32"></div>
        </div>
      {/each}
    {:else}
      {#each [
        { label: 'Total Flights', value: totalFlights.toLocaleString(), sub: `${(data.dailyOtp as []).length} days tracked`, color: '' },
        { label: 'On-Time Rate', value: `${onTimePct}%`, sub: `delay ≤ ${filterThreshold} min · ${n(hero.with_outcome)} flights with data`, color: Number(onTimePct) > 80 ? 'text-green-600' : Number(onTimePct) > 60 ? 'text-amber-600' : 'text-red-600' },
        { label: 'Cancellation Rate', value: `${cancelPct}%`, sub: `${totalCancelled} cancelled`, color: Number(cancelPct) > 15 ? 'text-red-600' : Number(cancelPct) > 8 ? 'text-amber-600' : 'text-green-600' },
        { label: 'Avg Delay (when late)', value: fmt(avgDelay), sub: 'exact from records', color: avgDelay > 120 ? 'text-red-600' : avgDelay > 60 ? 'text-amber-600' : '' },
      ] as card}
        <div class="rounded-xl border bg-card p-4">
          <p class="text-xs font-medium text-muted-foreground mb-1.5 leading-tight">{card.label}</p>
          <p class="text-2xl sm:text-3xl font-bold tabular-nums leading-none {card.color}">{card.value}</p>
          <p class="text-xs text-muted-foreground mt-1.5">{card.sub}</p>
        </div>
      {/each}
    {/if}
  </div>

  <!-- At a Glance -->
  <div class="mb-6">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">At a Glance</h2>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {#if isLoading}
        {#each [1,2,3,4,5,6,7,8] as _}
          <div class="rounded-xl border bg-card p-3.5">
            <div class="{sk} h-3 w-20 mb-2"></div>
            <div class="{sk} h-6 w-14 mb-2"></div>
            <div class="{sk} h-3 w-28"></div>
          </div>
        {/each}
      {:else}
        {#each insights as insight}
          {@const cls = toneClasses[insight.tone]}
          <div class="rounded-xl border p-3.5 {cls.card}">
            <p class="text-xs font-medium {cls.label} mb-1.5 leading-tight">{insight.label}</p>
            <p class="text-lg sm:text-xl font-bold tabular-nums leading-tight {cls.value}">{insight.value}</p>
            <p class="text-xs {cls.label} mt-1 leading-snug opacity-80">{insight.sub}</p>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Delay Impact -->
  <div class="rounded-xl border bg-card mb-6 overflow-hidden">
    <div class="px-4 pt-4 pb-3 border-b">
      <h2 class="text-sm font-semibold text-foreground">Cumulative Delay Impact</h2>
      <p class="text-xs text-muted-foreground mt-0.5">Based on exact recorded delay minutes for flights delayed &gt;5 min · 15 pax (Alderney routes) · 50 pax (all other routes)</p>
    </div>
    {#if isLoading}
      <div class="grid grid-cols-2 sm:grid-cols-4">
        {#each [1,2,3,4] as i}
          <div class="p-3 sm:p-4 {i % 2 !== 0 ? 'border-r' : ''} {i <= 2 ? 'border-b sm:border-b-0' : ''} {i < 4 ? 'sm:border-r' : ''}">
            <div class="{sk} h-3 w-20 mb-2"></div>
            <div class="{sk} h-7 w-16 mb-2"></div>
            <div class="{sk} h-3 w-24"></div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-4">
        <div class="p-3 sm:p-4 border-r border-b sm:border-b-0">
          <p class="text-xs font-medium text-muted-foreground mb-1">Total delay time</p>
          <p class="text-xl sm:text-2xl font-bold tabular-nums text-red-600">{impactHours.toLocaleString()}<span class="text-sm sm:text-base font-semibold ml-0.5">h</span></p>
          <p class="text-xs text-muted-foreground mt-1">{impactDays} days</p>
        </div>
        <div class="p-3 sm:p-4 border-b sm:border-b-0 sm:border-r">
          <p class="text-xs font-medium text-muted-foreground mb-1">Flights delayed &gt;5 min</p>
          <p class="text-xl sm:text-2xl font-bold tabular-nums">{fmtBig(n(impactData.flights_delayed_gt5))}</p>
          <p class="text-xs text-muted-foreground mt-1">of {fmtBig(n(impactData.operated))} operated</p>
        </div>
        <div class="p-3 sm:p-4 border-r">
          <p class="text-xs font-medium text-muted-foreground mb-1">Est. pax-hours lost</p>
          <p class="text-xl sm:text-2xl font-bold tabular-nums text-amber-600">{fmtBig(paxHours)}</p>
          <p class="text-xs text-muted-foreground mt-1">15 pax (ACI) / 50 pax (other)</p>
        </div>
        <div class="p-3 sm:p-4">
          <p class="text-xs font-medium text-muted-foreground mb-1">Est. economic cost</p>
          <p class="text-xl sm:text-2xl font-bold tabular-nums">{fmtMoney(costLow)}<span class="text-sm font-normal text-muted-foreground">–</span>{fmtMoney(costHigh)}</p>
          <p class="text-xs text-muted-foreground mt-1">£11.50–£25/hr</p>
        </div>
      </div>
    {/if}
    <div class="border-t">
      <p class="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Worst days by cumulative delay</p>
      {#if isLoading}
        <div class="divide-y sm:hidden">
          {#each [1,2,3,4,5] as _}
            <div class="px-4 py-3 space-y-1.5">
              <div class="{sk} h-4 w-28"></div>
              <div class="flex gap-3">
                <div class="{sk} h-3 w-16"></div>
                <div class="{sk} h-3 w-16"></div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="divide-y sm:hidden">
          {#each data.worstDelayDays as row}
            <button onclick={() => nav(`/search?date=${row.flight_date}`)} class="w-full text-left px-4 py-3 hover:bg-muted/30 active:bg-muted/50 transition-colors">
              <div class="flex items-center justify-between gap-2 mb-1">
                <span class="text-sm font-medium">{fmtDate(row.flight_date)}</span>
                <span class="font-semibold text-sm tabular-nums text-red-600">{Math.round(n(row.total_delay_mins) / 60)}h {n(row.total_delay_mins) % 60}m total delay</span>
              </div>
              <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span>{row.flights} flights</span>
                <span>avg {fmt(row.avg_delay)}</span>
                <span class="text-amber-600">{Math.round(n(row.pax_weighted_delay_mins) / 60).toLocaleString()} pax-hrs</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
      <div class="overflow-x-auto hidden sm:block">
        <table class="w-full">
          <thead class="border-y bg-muted/30">
            <tr>
              <th class="{thBtn} pl-4">Date</th>
              <th class="{thBtn}">Flights</th>
              <th class="{thBtn}">Avg Delay</th>
              <th class="{thBtn}">Total Delay</th>
              <th class="{thBtn} pr-4">Est. Pax-Hours</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            {#if isLoading}
              {#each [1,2,3,4,5] as _}
                <tr>
                  <td class="{tdBase} pl-4"><div class="{sk} h-4 w-24"></div></td>
                  <td class="{tdBase}"><div class="{sk} h-4 w-8"></div></td>
                  <td class="{tdBase}"><div class="{sk} h-4 w-12"></div></td>
                  <td class="{tdBase}"><div class="{sk} h-4 w-16"></div></td>
                  <td class="{tdBase} pr-4"><div class="{sk} h-4 w-14"></div></td>
                </tr>
              {/each}
            {:else}
              {#each data.worstDelayDays as row}
                <tr onclick={() => nav(`/search?date=${row.flight_date}`)} class="hover:bg-muted/30 transition-colors cursor-pointer">
                  <td class="{tdBase} pl-4">{fmtDate(row.flight_date)}</td>
                  <td class="{tdBase} tabular-nums">{row.flights}</td>
                  <td class="{tdBase} tabular-nums">{fmt(row.avg_delay)}</td>
                  <td class="{tdBase} tabular-nums font-semibold text-red-600">{Math.round(n(row.total_delay_mins) / 60)}h {n(row.total_delay_mins) % 60}m</td>
                  <td class="{tdBase} pr-4 tabular-nums text-amber-600">{Math.round(n(row.pax_weighted_delay_mins) / 60).toLocaleString()}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  <div class="rounded-xl border bg-card p-4 mb-4">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Daily OTP Trend</h2>
    {#if isLoading}
      <div class="{sk} h-48 sm:h-56 w-full rounded-lg"></div>
    {:else}
      <div class="relative h-48 sm:h-56"><canvas bind:this={trendCanvas}></canvas></div>
    {/if}
  </div>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
    <div class="rounded-xl border bg-card p-4">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Day of Week</h2>
      {#if isLoading}
        <div class="{sk} h-48 w-full rounded-lg"></div>
      {:else}
        <div class="relative h-48"><canvas bind:this={dowCanvas}></canvas></div>
      {/if}
    </div>
    <div class="rounded-xl border bg-card p-4">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Delay by Departure Hour</h2>
      {#if isLoading}
        <div class="{sk} h-48 w-full rounded-lg"></div>
      {:else}
        <div class="relative h-48"><canvas bind:this={hourCanvas}></canvas></div>
      {/if}
    </div>
  </div>
  <div class="rounded-xl border bg-card p-4 mb-6">
    <h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Delay Distribution</h2>
    {#if isLoading}
      <div class="{sk} h-32 w-full rounded-lg"></div>
    {:else}
      <div class="relative h-32"><canvas bind:this={distCanvas}></canvas></div>
    {/if}
  </div>
  <!-- Routes -->
  <div class="rounded-xl border bg-card mb-4 overflow-hidden">
    <div class="flex items-center justify-between px-4 pt-4 pb-2">
      <h2 class="text-sm font-semibold text-foreground">Routes</h2>
      <span class="text-xs text-muted-foreground hidden sm:block">{filterRoute ? 'Click row to deselect · ↗ to browse' : 'Click row to filter · ↗ to browse'}</span>
    </div>
    {#if isLoading}
      <div class="divide-y sm:hidden">
        {#each [1,2,3,4,5] as _}
          <div class="px-4 py-3 space-y-1.5">
            <div class="{sk} h-4 w-40"></div>
            <div class="flex gap-3">
              <div class="{sk} h-3 w-16"></div>
              <div class="{sk} h-3 w-16"></div>
              <div class="{sk} h-3 w-16"></div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="divide-y sm:hidden">
        {#each sortedRoutes as row}
          <button onclick={() => setRouteFilter(routeKey(row))} class="w-full text-left px-4 py-3 transition-colors {filterRoute === routeKey(row) ? 'bg-primary/5' : 'hover:bg-muted/30 active:bg-muted/50'}">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-semibold text-sm truncate">{fmtRoute(String(row.departure_airport), String(row.arrival_airport))}</span>
              <div class="flex items-center gap-2 shrink-0">
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {reliabilityBadge(row.reliability_score)}">{row.reliability_score ?? '—'}</span>
                <a href="/search?from={row.departure_airport}&to={row.arrival_airport}" onclick={(e) => e.stopPropagation()} class="text-xs text-muted-foreground hover:text-foreground">↗</a>
              </div>
            </div>
            <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>{row.flights} flights</span>
              <span class="{delayColor(row.delay_pct)}">{row.delay_pct ?? '—'}% delayed</span>
              <span>avg {fmt(row.avg_delay)}</span>
              <span>{row.cancelled} cancelled</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
    <div class="overflow-x-auto hidden sm:block">
      <table class="w-full">
        <thead class="border-y bg-muted/30">
          <tr>
            <th class="{thBtn} pl-4">Route</th>
            <th class="{thBtn}" onclick={() => routeSort = toggleSort(routeSort, 'flights')}>Flights {sortIcon(routeSort, 'flights')}</th>
            <th class="{thBtn}" onclick={() => routeSort = toggleSort(routeSort, 'delay_pct')}>Delay% {sortIcon(routeSort, 'delay_pct')}</th>
            <th class="{thBtn}" onclick={() => routeSort = toggleSort(routeSort, 'avg_delay')}>Avg Delay {sortIcon(routeSort, 'avg_delay')}</th>
            <th class="{thBtn}" onclick={() => routeSort = toggleSort(routeSort, 'max_delay')}>Max {sortIcon(routeSort, 'max_delay')}</th>
            <th class="{thBtn}" onclick={() => routeSort = toggleSort(routeSort, 'cancelled')}>Cancelled {sortIcon(routeSort, 'cancelled')}</th>
            <th class="{thBtn} pr-4" onclick={() => routeSort = toggleSort(routeSort, 'reliability_score')}>Score {sortIcon(routeSort, 'reliability_score')}</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          {#if isLoading}
            {#each [1,2,3,4,5,6,7,8] as _}
              <tr><td class="{tdBase} pl-4"><div class="{sk} h-4 w-20"></div></td>{#each [1,2,3,4,5,6] as _}<td class="{tdBase}"><div class="{sk} h-4 w-12"></div></td>{/each}</tr>
            {/each}
          {:else}
            {#each sortedRoutes as row}
              <tr onclick={() => setRouteFilter(routeKey(row))} class="transition-colors cursor-pointer {filterRoute === routeKey(row) ? 'bg-primary/5' : 'hover:bg-muted/30 active:bg-muted/50'}">
                <td class="{tdBase} pl-4 font-semibold whitespace-nowrap">
                  {fmtRoute(String(row.departure_airport), String(row.arrival_airport))}
                  <a href="/search?from={row.departure_airport}&to={row.arrival_airport}" onclick={(e) => e.stopPropagation()} class="ml-1.5 text-xs font-normal text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">↗</a>
                </td>
                <td class="{tdBase} tabular-nums">{row.flights}</td>
                <td class="{tdBase} tabular-nums" style="{cellBg(row.delay_pct)}"><span class="{delayColor(row.delay_pct)}">{row.delay_pct ?? '—'}%</span></td>
                <td class="{tdBase} tabular-nums">{fmt(row.avg_delay)}</td>
                <td class="{tdBase} tabular-nums">{fmt(row.max_delay)}</td>
                <td class="{tdBase} tabular-nums">{row.cancelled}</td>
                <td class="{tdBase} pr-4"><span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {reliabilityBadge(row.reliability_score)}">{row.reliability_score ?? '—'}</span></td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Flight numbers -->
  <div class="rounded-xl border bg-card mb-4 overflow-hidden">
    <div class="flex items-center justify-between px-4 pt-4 pb-2">
      <h2 class="text-sm font-semibold text-foreground">Most Delayed Flights{#if filterAirline}&nbsp;<span class="text-xs font-normal text-muted-foreground">· Aurigny only</span>{/if}</h2>
      <span class="text-xs text-muted-foreground hidden sm:block">Tap row to search</span>
    </div>
    {#if isLoading}
      <div class="divide-y sm:hidden">
        {#each [1,2,3,4,5] as _}
          <div class="px-4 py-3 space-y-1.5">
            <div class="{sk} h-4 w-24"></div>
            <div class="flex gap-3">
              <div class="{sk} h-3 w-16"></div>
              <div class="{sk} h-3 w-16"></div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="divide-y sm:hidden">
        {#each sortedFlights as row}
          <button onclick={() => nav(`/search?q=${row.flight_number}`)} class="w-full text-left px-4 py-3 hover:bg-muted/30 active:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-semibold text-sm">{row.flight_number}</span>
              <span class="{delayColor(row.delay_pct)} text-sm font-semibold tabular-nums">{row.delay_pct ?? '—'}% delayed</span>
            </div>
            <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>{row.operated} ops</span>
              <span>avg {fmt(row.avg_delay)}</span>
              <span>worst {fmt(row.worst_delay)}</span>
              <span>{row.cancelled} cancelled</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
    <div class="overflow-x-auto hidden sm:block">
      <table class="w-full">
        <thead class="border-y bg-muted/30">
          <tr>
            <th class="{thBtn} pl-4">Flight</th>
            <th class="{thBtn}" onclick={() => flightSort = toggleSort(flightSort, 'operated')}>Ops {sortIcon(flightSort, 'operated')}</th>
            <th class="{thBtn}" onclick={() => flightSort = toggleSort(flightSort, 'delay_pct')}>Delay% {sortIcon(flightSort, 'delay_pct')}</th>
            <th class="{thBtn}" onclick={() => flightSort = toggleSort(flightSort, 'avg_delay')}>Avg {sortIcon(flightSort, 'avg_delay')}</th>
            <th class="{thBtn}" onclick={() => flightSort = toggleSort(flightSort, 'worst_delay')}>Worst {sortIcon(flightSort, 'worst_delay')}</th>
            <th class="{thBtn} pr-4" onclick={() => flightSort = toggleSort(flightSort, 'cancelled')}>Cancelled {sortIcon(flightSort, 'cancelled')}</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          {#if isLoading}
            {#each [1,2,3,4,5,6,7] as _}
              <tr><td class="{tdBase} pl-4"><div class="{sk} h-4 w-16"></div></td>{#each [1,2,3,4,5] as _}<td class="{tdBase}"><div class="{sk} h-4 w-12"></div></td>{/each}</tr>
            {/each}
          {:else}
            {#each sortedFlights as row}
              <tr onclick={() => nav(`/search?q=${row.flight_number}`)} class="hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer">
                <td class="{tdBase} pl-4 font-semibold">{row.flight_number}</td>
                <td class="{tdBase} tabular-nums">{row.operated}</td>
                <td class="{tdBase} tabular-nums" style="{cellBg(row.delay_pct)}"><span class="{delayColor(row.delay_pct)}">{row.delay_pct ?? '—'}%</span></td>
                <td class="{tdBase} tabular-nums">{fmt(row.avg_delay)}</td>
                <td class="{tdBase} tabular-nums">{fmt(row.worst_delay)}</td>
                <td class="{tdBase} pr-4 tabular-nums">{row.cancelled}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Busiest + worst days -->
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
    <div class="rounded-xl border bg-card overflow-hidden">
      <div class="px-4 pt-4 pb-2"><h2 class="text-sm font-semibold text-foreground">Busiest Days</h2></div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-y bg-muted/30"><tr>
            <th class="{thBtn} pl-4">Date</th>
            <th class="{thBtn}">Flights</th>
            <th class="{thBtn}">Cancelled</th>
            <th class="{thBtn} pr-4">Landed</th>
          </tr></thead>
          <tbody class="divide-y">
            {#if isLoading}
              {#each [1,2,3,4,5] as _}<tr><td class="{tdBase} pl-4"><div class="{sk} h-4 w-24"></div></td>{#each [1,2,3] as _}<td class="{tdBase}"><div class="{sk} h-4 w-8"></div></td>{/each}</tr>{/each}
            {:else}
              {#each data.busiestDays as row}
                <tr onclick={() => nav(`/search?date=${row.flight_date}`)} class="hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer">
                  <td class="{tdBase} pl-4">{fmtDate(row.flight_date)}</td>
                  <td class="{tdBase} tabular-nums">{row.flights}</td>
                  <td class="{tdBase} tabular-nums {Number(row.cancelled) > 5 ? 'text-red-600' : ''}">{row.cancelled}</td>
                  <td class="{tdBase} pr-4 tabular-nums">{row.landed}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
    <div class="rounded-xl border bg-card overflow-hidden">
      <div class="px-4 pt-4 pb-2"><h2 class="text-sm font-semibold text-foreground">Worst Cancellation Days</h2></div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-y bg-muted/30"><tr>
            <th class="{thBtn} pl-4">Date</th>
            <th class="{thBtn}">Cancelled</th>
            <th class="{thBtn}">Total</th>
            <th class="{thBtn} pr-4">Cancel%</th>
          </tr></thead>
          <tbody class="divide-y">
            {#if isLoading}
              {#each [1,2,3,4,5] as _}<tr><td class="{tdBase} pl-4"><div class="{sk} h-4 w-24"></div></td>{#each [1,2,3] as _}<td class="{tdBase}"><div class="{sk} h-4 w-8"></div></td>{/each}</tr>{/each}
            {:else}
              {#each data.worstDays as row}
                <tr onclick={() => nav(`/search?date=${row.flight_date}`)} class="hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer">
                  <td class="{tdBase} pl-4">{fmtDate(row.flight_date)}</td>
                  <td class="{tdBase} tabular-nums text-red-600 font-semibold">{row.cancelled}</td>
                  <td class="{tdBase} tabular-nums">{row.total_flights}</td>
                  <td class="{tdBase} pr-4" style="{cellBg(row.cancel_pct)}"><span class="{delayColor(row.cancel_pct)}">{row.cancel_pct}%</span></td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Top delays -->
  <div class="rounded-xl border bg-card mb-4 overflow-hidden">
    <div class="px-4 pt-4 pb-2"><h2 class="text-sm font-semibold text-foreground">Longest Individual Delays</h2></div>
    {#if isLoading}
      <div class="divide-y sm:hidden">
        {#each [1,2,3,4,5] as _}
          <div class="px-4 py-3 space-y-1.5">
            <div class="{sk} h-4 w-28"></div>
            <div class="flex gap-3">
              <div class="{sk} h-3 w-20"></div>
              <div class="{sk} h-3 w-16"></div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="divide-y sm:hidden">
        {#each (data.topDelays as Record<string, unknown>[]) as row}
          <button onclick={() => nav(`/flights/${row.id}`)} class="w-full text-left px-4 py-3 hover:bg-muted/30 active:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-semibold text-sm">{row.flight_number}</span>
              <span class="font-bold tabular-nums text-red-600 text-sm">{fmt(row.delay_minutes)}</span>
            </div>
            <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>{fmtDate(row.flight_date)}</span>
              <span>{fmtRoute(String(row.departure_airport), String(row.arrival_airport))}</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
    <div class="overflow-x-auto hidden sm:block">
      <table class="w-full">
        <thead class="border-y bg-muted/30"><tr>
          <th class="{thBtn} pl-4">Flight</th>
          <th class="{thBtn}">Date</th>
          <th class="{thBtn}">Route</th>
          <th class="{thBtn} pr-4">Delay</th>
        </tr></thead>
        <tbody class="divide-y">
          {#if isLoading}
            {#each [1,2,3,4,5] as _}<tr><td class="{tdBase} pl-4"><div class="{sk} h-4 w-14"></div></td><td class="{tdBase}"><div class="{sk} h-4 w-24"></div></td><td class="{tdBase}"><div class="{sk} h-4 w-16"></div></td><td class="{tdBase} pr-4"><div class="{sk} h-4 w-10"></div></td></tr>{/each}
          {:else}
            {#each (data.topDelays as Record<string, unknown>[]) as row}
              <tr onclick={() => nav(`/flights/${row.id}`)} class="hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer">
                <td class="{tdBase} pl-4 font-semibold">{row.flight_number}</td>
                <td class="{tdBase}">{fmtDate(row.flight_date)}</td>
                <td class="{tdBase} whitespace-nowrap">{fmtRoute(String(row.departure_airport), String(row.arrival_airport))}</td>
                <td class="{tdBase} pr-4 font-bold tabular-nums text-red-600">{fmt(row.delay_minutes)}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Monthly + aircraft -->
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
    <div class="rounded-xl border bg-card overflow-hidden">
      <div class="px-4 pt-4 pb-2"><h2 class="text-sm font-semibold text-foreground">Monthly Breakdown</h2></div>
      {#if isLoading}
        <div class="divide-y sm:hidden">
          {#each [1,2,3] as _}
            <div class="px-4 py-3 space-y-1.5">
              <div class="{sk} h-4 w-24"></div>
              <div class="flex gap-3">
                <div class="{sk} h-3 w-14"></div>
                <div class="{sk} h-3 w-14"></div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="divide-y sm:hidden">
          {#each data.monthlyBreakdown as row}
            <div class="px-4 py-3">
              <div class="flex items-center justify-between gap-2 mb-1">
                <span class="font-medium text-sm">{row.month}</span>
                <span class="{delayColor(row.cancel_pct)} text-xs font-medium">{row.cancel_pct}% cancelled</span>
              </div>
              <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span>{row.flights} flights</span>
                <span>{row.cancelled} cancelled</span>
                <span>avg delay {fmt(row.avg_delay)}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      <div class="overflow-x-auto hidden sm:block">
        <table class="w-full">
          <thead class="border-y bg-muted/30"><tr>
            <th class="{thBtn} pl-4">Month</th>
            <th class="{thBtn}">Flights</th>
            <th class="{thBtn}">Cancelled</th>
            <th class="{thBtn}">Cancel%</th>
            <th class="{thBtn} pr-4">Avg Delay</th>
          </tr></thead>
          <tbody class="divide-y">
            {#if isLoading}
              {#each [1,2,3] as _}<tr><td class="{tdBase} pl-4"><div class="{sk} h-4 w-20"></div></td>{#each [1,2,3,4] as _}<td class="{tdBase}"><div class="{sk} h-4 w-10"></div></td>{/each}</tr>{/each}
            {:else}
              {#each data.monthlyBreakdown as row}
                <tr>
                  <td class="{tdBase} pl-4 font-medium">{row.month}</td>
                  <td class="{tdBase} tabular-nums">{row.flights}</td>
                  <td class="{tdBase} tabular-nums">{row.cancelled}</td>
                  <td class="{tdBase}" style="{cellBg(row.cancel_pct)}"><span class="{delayColor(row.cancel_pct)}">{row.cancel_pct}%</span></td>
                  <td class="{tdBase} pr-4 tabular-nums">{fmt(row.avg_delay)}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
    <div class="rounded-xl border bg-card overflow-hidden">
      <div class="px-4 pt-4 pb-2"><h2 class="text-sm font-semibold text-foreground">Aircraft Usage</h2></div>
      {#if isLoading}
        <div class="divide-y sm:hidden">
          {#each [1,2,3,4,5,6] as _}
            <div class="px-4 py-3 space-y-1.5">
              <div class="{sk} h-4 w-20"></div>
              <div class="flex gap-3">
                <div class="{sk} h-3 w-14"></div>
                <div class="{sk} h-3 w-14"></div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="divide-y sm:hidden">
          {#each data.aircraftUsage as row}
            <div class="px-4 py-3">
              <div class="flex items-center justify-between gap-2 mb-1">
                <span class="font-mono font-semibold text-sm">{row.aircraft_registration}</span>
                <span class="text-xs text-muted-foreground">{row.aircraft_type}</span>
              </div>
              <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span>{row.flights} flights</span>
                <span>{row.cancelled} cancelled</span>
                <span>avg delay {fmt(row.avg_delay)}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      <div class="overflow-x-auto hidden sm:block">
        <table class="w-full">
          <thead class="border-y bg-muted/30"><tr>
            <th class="{thBtn} pl-4">Reg</th>
            <th class="{thBtn}">Type</th>
            <th class="{thBtn}">Flights</th>
            <th class="{thBtn}">Cancelled</th>
            <th class="{thBtn} pr-4">Avg Delay</th>
          </tr></thead>
          <tbody class="divide-y">
            {#if isLoading}
              {#each [1,2,3,4,5,6] as _}<tr><td class="{tdBase} pl-4"><div class="{sk} h-4 w-20"></div></td>{#each [1,2,3,4] as _}<td class="{tdBase}"><div class="{sk} h-4 w-10"></div></td>{/each}</tr>{/each}
            {:else}
              {#each data.aircraftUsage as row}
                <tr>
                  <td class="{tdBase} pl-4 font-mono font-semibold text-sm">{row.aircraft_registration}</td>
                  <td class="{tdBase}">{row.aircraft_type}</td>
                  <td class="{tdBase} tabular-nums">{row.flights}</td>
                  <td class="{tdBase} tabular-nums">{row.cancelled}</td>
                  <td class="{tdBase} pr-4 tabular-nums">{fmt(row.avg_delay)}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Weather Impact -->
  <div class="rounded-xl border bg-card mb-4 overflow-hidden">
    <div class="px-4 pt-4 pb-3 border-b">
      <h2 class="text-sm font-semibold text-foreground">Weather Impact</h2>
      <p class="text-xs text-muted-foreground mt-0.5">Based on {data.wxFlightCount} flights matched to hourly GCI weather · wind speed is 10m mean (not gusts) · crosswind calculated for RWY 09/27 (096°) · visibility in km · precip in mm</p>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x">
      {#each [
        { title: 'By Wind Speed', rows: data.windDelays, bandKey: 'wind_band' },
        { title: 'By Crosswind (RWY 09/27)', rows: data.crosswindDelays, bandKey: 'xw_band' },
        { title: 'By Visibility',  rows: data.visibilityDelays, bandKey: 'vis_band' },
        { title: 'By Precipitation', rows: data.precipDelays, bandKey: 'precip_band' },
        { title: 'By Weather Condition', rows: data.weatherCodeDelays, bandKey: 'weather_code', isCode: true },
      ] as section}
        <div class="p-4">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{section.title}</h3>
          <table class="w-full">
            <thead><tr class="border-b">
              <th class="text-left text-xs text-muted-foreground pb-1.5 font-medium">Condition</th>
              <th class="text-right text-xs text-muted-foreground pb-1.5 font-medium">Flights</th>
              <th class="text-right text-xs text-muted-foreground pb-1.5 font-medium">Delay%</th>
              <th class="text-right text-xs text-muted-foreground pb-1.5 font-medium hidden sm:table-cell">Avg</th>
            </tr></thead>
            <tbody class="divide-y">
              {#if isLoading}
                {#each [1,2,3,4] as _}<tr><td class="py-2 pr-2"><div class="{sk} h-4 w-24"></div></td><td class="py-2 text-right"><div class="{sk} h-4 w-8 ml-auto"></div></td><td class="py-2 text-right"><div class="{sk} h-4 w-10 ml-auto"></div></td><td class="py-2 text-right hidden sm:table-cell"><div class="{sk} h-4 w-12 ml-auto"></div></td></tr>{/each}
              {:else}
                {#each section.rows as row}
                  <tr>
                    <td class="py-2 pr-2 text-sm {section.bandKey === 'xw_band' ? xwBandColor(row[section.bandKey]) : ''}">{section.isCode ? (WX_LABELS[Number(row[section.bandKey])] ?? `Code ${row[section.bandKey]}`) : row[section.bandKey]}</td>
                    <td class="py-2 text-right text-sm tabular-nums">{row.flights}</td>
                    <td class="py-2 text-right text-sm tabular-nums" style="{cellBg(row.delay_pct)}"><span class="{delayColor(row.delay_pct)}">{row.delay_pct ?? '—'}%</span></td>
                    <td class="py-2 text-right text-sm tabular-nums hidden sm:table-cell">{fmt(row.avg_delay)}</td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      {/each}
    </div>
  </div>

  <!-- Worst weather days -->
  <div class="rounded-xl border bg-card mb-4 overflow-hidden">
    <div class="px-4 pt-4 pb-2"><h2 class="text-sm font-semibold text-foreground">Worst Weather Days</h2></div>
    {#if isLoading}
      <div class="divide-y sm:hidden">
        {#each [1,2,3,4,5] as _}
          <div class="px-4 py-3 space-y-1.5">
            <div class="{sk} h-4 w-28"></div>
            <div class="flex gap-3">
              <div class="{sk} h-3 w-16"></div>
              <div class="{sk} h-3 w-16"></div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="divide-y sm:hidden">
        {#each data.worstWeatherDays as row}
          <button onclick={() => nav(`/search?date=${row.flight_date}`)} class="w-full text-left px-4 py-3 hover:bg-muted/30 active:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-sm font-medium">{fmtDate(row.flight_date)}</span>
              <span class="text-xs text-muted-foreground">{row.flights} flights · <span class="text-red-600 font-medium">{row.cancelled} cancelled</span></span>
            </div>
            <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>avg delay {fmt(row.avg_delay)}</span>
              <span class="{Number(row.wind_kn) > 30 ? 'text-red-600 font-medium' : Number(row.wind_kn) > 25 ? 'text-amber-600' : ''}">{row.wind_kn}kn {degToCardinal(row.wind_dir)}</span>
              <span class="{Number(row.vis_km) < 3 ? 'text-red-600 font-medium' : Number(row.vis_km) < 5 ? 'text-amber-600' : ''}">{row.vis_km}km vis</span>
              <span>{row.precip_mm}mm precip</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
    <div class="overflow-x-auto hidden sm:block">
      <table class="w-full">
        <thead class="border-y bg-muted/30"><tr>
          <th class="{thBtn} pl-4">Date</th>
          <th class="{thBtn}">Flights</th>
          <th class="{thBtn}">Cancelled</th>
          <th class="{thBtn}">Avg Delay</th>
          <th class="{thBtn}">Wind</th>
          <th class="{thBtn}">Vis Km</th>
          <th class="{thBtn} pr-4">Precip mm</th>
        </tr></thead>
        <tbody class="divide-y">
          {#if isLoading}
            {#each [1,2,3,4,5,6,7,8] as _}<tr><td class="{tdBase} pl-4"><div class="{sk} h-4 w-24"></div></td>{#each [1,2,3,4,5] as _}<td class="{tdBase}"><div class="{sk} h-4 w-10"></div></td>{/each}</tr>{/each}
          {:else}
            {#each data.worstWeatherDays as row}
              <tr onclick={() => nav(`/search?date=${row.flight_date}`)} class="hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer">
                <td class="{tdBase} pl-4">{fmtDate(row.flight_date)}</td>
                <td class="{tdBase} tabular-nums">{row.flights}</td>
                <td class="{tdBase} tabular-nums text-red-600 font-medium">{row.cancelled}</td>
                <td class="{tdBase} tabular-nums">{fmt(row.avg_delay)}</td>
                <td class="{tdBase} tabular-nums {Number(row.wind_kn) > 30 ? 'text-red-600 font-medium' : Number(row.wind_kn) > 25 ? 'text-amber-600' : ''}">{row.wind_kn}kn {degToCardinal(row.wind_dir)}</td>
                <td class="{tdBase} tabular-nums {Number(row.vis_km) < 3 ? 'text-red-600 font-medium' : Number(row.vis_km) < 5 ? 'text-amber-600' : ''}">{row.vis_km}</td>
                <td class="{tdBase} pr-4 tabular-nums">{row.precip_mm}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>
