<script lang="ts">
  import '../app.css';
  import { ThemeToggle } from '$lib/components';

  let { data, children } = $props();

  const umamiWebsiteId = $derived(data.umamiWebsiteId);
  const umamiUrl = $derived(data.umamiUrl);
  const siteUrl = $derived(data.siteUrl);
  const buyMeACoffeeUrl = $derived(data.buyMeACoffeeUrl);

  // Use $state with a local variable so the toggle mutation works,
  // but initialise from the server data prop so it stays in sync on navigation.
  let theme = $state(data.theme ?? 'light');
  $effect(() => { theme = data.theme ?? 'light'; });

  // Matches the background CSS custom property for each theme:
  // light: hsl(210 40% 98%) / dark: hsl(222 47% 8%)
  const THEME_COLORS = { light: '#f0f5fb', dark: '#0b1020' } as const;
  let themeColor = $derived(THEME_COLORS[theme as keyof typeof THEME_COLORS] ?? THEME_COLORS.light);

  async function toggleTheme() {
    theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');

    // Persist the preference as a cookie so the server reads it on next request
    await fetch('/api/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    });
  }
</script>

<svelte:head>
  <meta name="theme-color" content={themeColor} />

  <!-- Default SEO — individual pages override title/description/og:* via their own <svelte:head> -->
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href={siteUrl} />

  <!-- Open Graph defaults -->
  <meta property="og:site_name" content="delays.gg" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={siteUrl} />
  <meta property="og:image" content="{siteUrl}/android-chrome-512x512.png" />
  <meta property="og:image:width" content="512" />
  <meta property="og:image:height" content="512" />
  <meta property="og:image:alt" content="delays.gg logo" />

  <!-- Twitter / X Card defaults -->
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:image" content="{siteUrl}/android-chrome-512x512.png" />

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
        <span class="font-bold text-xl">delays.gg</span>
      </a>

      <nav class="flex flex-1 items-center space-x-6 text-sm font-medium">
        <!-- Navigation items removed - search integrated into homepage -->
      </nav>

      <div class="flex items-center space-x-4">
        {#if buyMeACoffeeUrl}
          <a
            href={buyMeACoffeeUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            Support Us
          </a>
        {/if}
        <ThemeToggle {theme} onToggle={toggleTheme} />
      </div>
    </div>
  </header>

  <main id="main-content" class="flex-1">
    {@render children()}
  </main>

  <footer class="border-t py-6 md:py-0">
    <div class="container flex flex-col items-center justify-between gap-4 md:h-14 md:flex-row">
      <p class="text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} delays.gg &mdash; Flight delay predictions for Guernsey
      </p>
    </div>
  </footer>
</div>
