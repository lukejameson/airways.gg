<script lang="ts">
  import '../app.css';
  import { initAirports } from '$lib/airports';
  import type { AirportInfo } from '$lib/airports';

  let { data, children } = $props();

  // Call synchronously so the store is populated before the first render,
  // preventing the IATA code fallback flash on initial load.
  // $effect re-runs on subsequent data invalidations (e.g. navigation).
  initAirports(data.airports as Record<string, AirportInfo>);
  $effect(() => {
    initAirports(data.airports as Record<string, AirportInfo>);
  });

  const umamiWebsiteId = $derived(data.umamiWebsiteId);
  const umamiUrl = $derived(data.umamiUrl);
  const siteUrl = $derived(data.siteUrl);
  const buyMeACoffeeUrl = $derived(data.buyMeACoffeeUrl);

</script>

<svelte:head>
  <meta name="theme-color" content="#f0f5fb" />

  <!-- Default SEO — individual pages override title/description/og:* via their own <svelte:head> -->
  <meta name="robots" content="index, follow" />

  <!-- Open Graph defaults -->
  <meta property="og:site_name" content="airways.gg" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={siteUrl} />
  <meta property="og:image" content="{siteUrl}/android-chrome-512x512.webp" />
  <meta property="og:image:width" content="512" />
  <meta property="og:image:height" content="512" />
  <meta property="og:image:alt" content="airways.gg — Guernsey Airport flight tracker" />

  <!-- Twitter / X Card defaults -->
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:image" content="{siteUrl}/android-chrome-512x512.webp" />

  <!-- Structured data: Organisation + WebSite with SearchAction -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": siteUrl + "/#organization",
        "name": "airways.gg",
        "url": siteUrl,
        "logo": {
          "@type": "ImageObject",
          "url": siteUrl + "/android-chrome-512x512.webp",
          "width": 512,
          "height": 512
        },
        "description": "Live flight tracker for Guernsey Airport (GCI) — real-time delays, cancellations, and AI-powered predictions."
      },
      {
        "@type": "WebSite",
        "@id": siteUrl + "/#website",
        "url": siteUrl,
        "name": "airways.gg",
        "description": "Live flight tracker for Guernsey Airport (GCI)",
        "publisher": { "@id": siteUrl + "/#organization" },
        "potentialAction": {
          "@type": "SearchAction",
          "target": {
            "@type": "EntryPoint",
            "urlTemplate": siteUrl + "/search?q={search_term_string}"
          },
          "query-input": "required name=search_term_string"
        }
      }
    ]
  })}</script>`}

  {#if umamiWebsiteId && umamiUrl}
    <script
      defer
      src="{umamiUrl}/script.js"
      data-website-id="{umamiWebsiteId}"
    ></script>
  {/if}
</svelte:head>

<a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md">
  Skip to main content
</a>

<div class="min-h-screen bg-background flex flex-col">
  <header class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
    <div class="container flex h-14 items-center">
      <a href="/" class="mr-6 flex items-center space-x-2">
        <span class="font-bold text-xl">airways.gg</span>
      </a>

      <nav class="flex flex-1 items-center space-x-6 text-sm font-medium">
      </nav>
      <div class="flex items-center space-x-4">
        <!-- <a
          href="/stats"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          <span class="hidden sm:inline">Stats</span>
        </a> -->
        <a
          href="/contact"
          aria-label="Contact"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="hidden sm:inline">Contact</span>
        </a>
        {#if buyMeACoffeeUrl}
          <a
            href={buyMeACoffeeUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Support Us"
            class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <span class="hidden sm:inline">Support Us</span>
          </a>
        {/if}
      </div>
    </div>
  </header>

  <main id="main-content" class="flex-1">
    {@render children()}
  </main>

  <footer class="border-t py-5">
    <div class="container flex items-center justify-between gap-4">
      <p class="text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} airways.gg<span class="hidden sm:inline"> &mdash; Sister site to <a href="https://roads.gg" target="_blank" rel="noopener noreferrer" class="underline underline-offset-4 hover:text-foreground transition-colors">roads.gg</a>. Built by <a href="https://lukejameson.co.uk" target="_blank" rel="noopener noreferrer" class="underline underline-offset-4 hover:text-foreground transition-colors">Luke Jameson</a></span>.
      </p>
      <div class="flex items-center gap-4 text-sm text-muted-foreground">
        <span class="sm:hidden">
          <a href="https://roads.gg" target="_blank" rel="noopener noreferrer" class="hover:text-foreground transition-colors">roads.gg</a>
          &middot;
          <a href="https://lukejameson.co.uk" target="_blank" rel="noopener noreferrer" class="hover:text-foreground transition-colors">Portfolio</a>
        </span>
        <a
          href="https://www.facebook.com/profile.php?id=61588602583247"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Follow airways.gg on Facebook"
          class="hover:text-foreground transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.791-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.971h-1.513c-1.491 0-1.956.93-1.956 1.883v2.27h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
          </svg>
        </a>
      </div>
    </div>
  </footer>
</div>
