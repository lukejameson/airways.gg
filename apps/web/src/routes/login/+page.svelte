<script lang="ts">
  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state('');

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    loading = true;
    error = '';
    // Placeholder — auth not yet implemented
    await new Promise((r) => setTimeout(r, 800));
    error = 'Authentication is not yet available.';
    loading = false;
  }
</script>

<svelte:head>
  <title>Login — delays.gg</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="container flex min-h-[calc(100vh-8rem)] items-center justify-center py-12">
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <a href="/" class="inline-flex items-center gap-2 font-bold text-2xl mb-4">
        <span>delays.gg</span>
      </a>
      <h1 class="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p class="text-sm text-muted-foreground mt-1">Enter your credentials to access your account</p>
    </div>

    <div class="rounded-lg border bg-card p-6 shadow-sm">
      <form onsubmit={handleSubmit} class="space-y-4">
        <div class="space-y-2">
          <label for="email" class="text-sm font-medium">Email</label>
          <input
            id="email"
            type="email"
            name="email"
            bind:value={email}
            placeholder="you@example.com"
            required
            autocomplete="email"
            class="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          />
        </div>

        <div class="space-y-2">
          <label for="password" class="text-sm font-medium">Password</label>
          <input
            id="password"
            type="password"
            name="password"
            bind:value={password}
            placeholder="••••••••"
            required
            autocomplete="current-password"
            class="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          />
        </div>

        {#if error}
          <div class="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        {/if}

        <button
          type="submit"
          disabled={loading}
          class="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          {#if loading}
            <span class="inline-flex items-center gap-2">
              <svg class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              Signing in…
            </span>
          {:else}
            Sign in
          {/if}
        </button>
      </form>
    </div>

    <p class="mt-4 text-center text-xs text-muted-foreground">
      Authentication is coming soon. <a href="/" class="underline underline-offset-2 hover:text-foreground">Return to live board</a>
    </p>
  </div>
</div>
