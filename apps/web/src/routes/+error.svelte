<script lang="ts">
  import { page } from '$app/stores';
</script>

<svelte:head>
  <title>{$page.status} — airways.gg</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-[60vh] flex items-center justify-center px-4">
  <div class="text-center max-w-md">
    <p class="text-7xl font-bold text-muted-foreground/30 mb-4">{$page.status}</p>
    <h1 class="text-2xl font-semibold mb-2">
      {#if $page.status === 404}
        Page not found
      {:else if $page.status === 500}
        Something went wrong
      {:else}
        {$page.error?.message ?? 'An error occurred'}
      {/if}
    </h1>
    <p class="text-muted-foreground mb-8">
      {#if $page.status === 404}
        The page you're looking for doesn't exist or has been moved.
      {:else}
        We're having trouble loading this page. Please try again shortly.
      {/if}
    </p>
    <div class="flex flex-col sm:flex-row gap-3 justify-center">
      <a
        href="/"
        class="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
      >
        Go to flight board
      </a>
      <button
        onclick={() => window.history.back()}
        class="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-2.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        Go back
      </button>
    </div>
  </div>
</div>
