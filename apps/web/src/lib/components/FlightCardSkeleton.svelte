<script lang="ts">
  interface Props {
    count?: number;
  }

  let { count = 5 }: Props = $props();
</script>

{#each Array(count) as _}
  <!-- Outer matches FlightCard's rounded-lg border border-border bg-card -->
  <div class="rounded-lg border border-border bg-card animate-pulse">

    <!-- Main row — exact match: flex items-center gap-3 sm:gap-4 px-4 py-3 -->
    <div class="flex items-center gap-3 sm:gap-4 px-4 py-3">

      <!-- Time: w-16 shrink-0 text-center. text-lg leading-none = 18px tall -->
      <div class="w-16 shrink-0">
        <div class="h-[18px] w-12 bg-muted rounded mx-auto"></div>
      </div>

      <!-- Divider — hidden sm:block h-10 w-px (desktop only, exactly as in FlightCard) -->
      <div class="hidden sm:block h-10 w-px shrink-0 bg-border"></div>

      <!-- Flight + route: min-w-0 flex-1 -->
      <div class="min-w-0 flex-1">
        <!-- Line 1: text-base leading-none (16px) + text-xs aircraft type (12px) -->
        <div class="flex items-baseline gap-2">
          <div class="h-4 w-20 bg-muted rounded"></div>
          <div class="h-3 w-12 bg-muted rounded"></div>
        </div>
        <!-- Line 2: text-sm (line-height 1.25rem = 20px), mt-0.5 gap -->
        <div class="mt-0.5 h-5 w-36 bg-muted rounded"></div>
      </div>

      <!-- Status badge: ml-auto, rounded-md px-2.5 py-1 text-xs border
           Height = line-height (16px) + py-1×2 (8px) + border×2 (2px) = 26px -->
      <div class="flex items-center gap-2 shrink-0 ml-auto">
        <div class="h-[26px] w-20 bg-muted rounded-md"></div>
      </div>
    </div>

    <!-- Weather strip — desktop only, matches hidden sm:flex border-t border-border/60 px-4 py-1.5
         Height = py-1.5×2 (12px) + text-xs line-height (16px) = 28px -->
    <div class="hidden sm:flex items-center gap-4 border-t border-border/60 px-4 py-1.5">
      <div class="h-4 w-40 bg-muted rounded"></div>
      <div class="h-4 w-32 bg-muted rounded"></div>
    </div>

  </div>
{/each}

<style>
  .animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>
