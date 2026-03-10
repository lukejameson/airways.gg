<script lang="ts">
  import { onDestroy } from 'svelte';

  interface Props {
    scheduledTime: string | Date | null | undefined;
    estimatedTime: string | Date | null | undefined;
    actualTime: string | Date | null | undefined;
    isCompleted: boolean;
    class?: string;
  }

  let { scheduledTime, estimatedTime, actualTime, isCompleted, class: className = '' }: Props = $props();

  let now = $state(Date.now());
  let interval: ReturnType<typeof setInterval> | null = null;

  const scheduledMs = $derived(scheduledTime ? new Date(scheduledTime).getTime() : null);
  const estimatedMs = $derived(estimatedTime ? new Date(estimatedTime).getTime() : null);
  const actualMs = $derived(actualTime ? new Date(actualTime).getTime() : null);

  const referenceMs = $derived(estimatedMs ?? scheduledMs);

  const finalDelayMinutes = $derived.by(() => {
    if (actualMs === null || scheduledMs === null) return null;
    return Math.round((actualMs - scheduledMs) / 60_000);
  });

  const isLive = $derived(
    !isCompleted &&
    actualMs === null &&
    referenceMs !== null &&
    scheduledMs !== null &&
    now > referenceMs
  );

  const liveDelayMinutes = $derived(
    isLive && scheduledMs !== null
      ? Math.floor((now - scheduledMs) / 60_000)
      : null
  );

  $effect(() => {
    if (isLive && !interval) {
      interval = setInterval(() => { now = Date.now(); }, 60_000);
    } else if (!isLive && interval) {
      clearInterval(interval);
      interval = null;
    }
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });

  function formatStatic(minutes: number): string {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs > 0 && mins > 0) return `+${hrs}h ${mins}m`;
    if (hrs > 0) return `+${hrs}h`;
    return `+${mins}m`;
  }

  function formatLive(totalMinutes: number): string {
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hrs > 0 && mins > 0) return `+${hrs}h ${mins}m`;
    if (hrs > 0) return `+${hrs}h`;
    return `+${mins}m`;
  }
</script>

{#if finalDelayMinutes !== null && finalDelayMinutes > 0}
  <span class="tabular-nums font-bold text-red-600 {className}">{formatStatic(finalDelayMinutes)}</span>
{:else if liveDelayMinutes !== null && liveDelayMinutes > 0}
  <span class="tabular-nums font-bold text-red-600 {className}">{formatLive(liveDelayMinutes)}</span>
{/if}
