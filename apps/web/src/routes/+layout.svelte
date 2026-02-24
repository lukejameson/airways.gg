<script lang="ts">
  import '../app.css';
  import { ThemeToggle } from '$lib/components';

  let { data, children } = $props();

  // Use $state with a local variable so the toggle mutation works,
  // but initialise from the server data prop so it stays in sync on navigation.
  let theme = $state(data.theme ?? 'light');
  $effect(() => { theme = data.theme ?? 'light'; });

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
