<script lang="ts">
  import { browser } from '$app/environment';
  import { env } from '$env/dynamic/public';
  import { onMount } from 'svelte';

  interface Props {
    flightId: number;
    flightCode: string;
    flightDate: string;
  }

  let { flightId, flightCode, flightDate }: Props = $props();

  type State = 'loading' | 'idle' | 'subscribed' | 'unsupported' | 'needs-install';

  let state: State = $state('loading');
  let showInstallBanner = $state(false);

  function isIos(): boolean {
    if (!browser) return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function isInStandaloneMode(): boolean {
    if (!browser) return false;
    return (
      ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true) ||
      window.matchMedia('(display-mode: standalone)').matches
    );
  }

  async function getSubscription(): Promise<PushSubscription | null> {
    if (!browser || !('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  onMount(async () => {
    if (!browser) return;

    const vapidKey = env.PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      state = 'unsupported';
      return;
    }

    // iOS Safari (not installed as PWA) — push is only available as installed PWA on iOS
    if (isIos() && !isInStandaloneMode()) {
      state = 'needs-install';
      return;
    }

    // Check for push support
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      state = 'unsupported';
      return;
    }

    try {
      const sub = await getSubscription();
      if (sub) {
        // Check if subscribed for this specific flight
        const res = await fetch(
          `/api/push/check/${flightId}?endpoint=${encodeURIComponent(sub.endpoint)}`
        );
        const data: { subscribed: boolean } = await res.json();
        state = data.subscribed ? 'subscribed' : 'idle';
      } else {
        state = 'idle';
      }
    } catch {
      state = 'idle';
    }
  });

  async function subscribe() {
    const vapidKey = env.PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;

    state = 'loading';
    try {
      const reg = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        state = 'idle';
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), flightId, flightCode, flightDate }),
      });

      state = 'subscribed';
    } catch {
      state = 'idle';
    }
  }

  async function unsubscribe() {
    state = 'loading';
    try {
      const sub = await getSubscription();
      if (!sub) { state = 'idle'; return; }

      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint, flightId }),
      });

      state = 'idle';
    } catch {
      state = 'subscribed';
    }
  }

  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }
</script>

{#if state === 'needs-install'}
  <div class="relative">
    <button
      onclick={() => (showInstallBanner = !showInstallBanner)}
      class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors rounded-md px-2 py-1"
      aria-label="Get flight notifications"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
      </svg>
      Notify me
    </button>
    {#if showInstallBanner}
      <div class="absolute right-0 top-8 z-10 w-64 rounded-lg border bg-popover p-3 shadow-md text-sm">
        <p class="font-medium mb-1">Add to Home Screen</p>
        <p class="text-muted-foreground text-xs">To get flight notifications on iOS, add airways.gg to your Home Screen first. Tap <span class="font-medium">Share</span> then <span class="font-medium">Add to Home Screen</span>.</p>
        <button onclick={() => (showInstallBanner = false)} class="mt-2 text-xs text-muted-foreground hover:text-foreground">Dismiss</button>
      </div>
    {/if}
  </div>
{:else if state === 'idle'}
  <button
    onclick={subscribe}
    class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors rounded-md px-2 py-1"
    aria-label="Subscribe to flight notifications"
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
    </svg>
    Notify me
  </button>
{:else if state === 'subscribed'}
  <button
    onclick={unsubscribe}
    class="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors rounded-md px-2 py-1"
    aria-label="Unsubscribe from flight notifications"
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
    </svg>
    Notifying
  </button>
{:else if state === 'loading'}
  <div class="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground" aria-label="Loading">
    <svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  </div>
{/if}
<!-- state === 'unsupported': render nothing -->
