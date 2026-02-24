<script lang="ts">
  interface Props {
    count?: number;
  }
  
  let { count = 5 }: Props = $props();
</script>

{#each Array(count) as _, i}
  <div class="rounded-xl border border-border/50 bg-card/50 p-4 animate-pulse">
    <div class="flex items-center gap-4">
      <!-- Time skeleton -->
      <div class="w-16 shrink-0">
        <div class="h-6 w-12 bg-muted rounded"></div>
      </div>
      
      <!-- Divider -->
      <div class="h-10 w-px bg-border"></div>
      
      <!-- Flight info skeleton -->
      <div class="min-w-0 flex-1 space-y-2">
        <div class="flex items-center gap-2">
          <div class="h-5 w-16 bg-muted rounded"></div>
          <div class="h-4 w-12 bg-muted rounded"></div>
        </div>
        <div class="h-4 w-32 bg-muted rounded"></div>
      </div>
      
      <!-- Status badge skeleton -->
      <div class="shrink-0">
        <div class="h-7 w-20 bg-muted rounded-full"></div>
      </div>
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
