<script lang="ts">
  import { enhance } from '$app/forms';
  let { data, form } = $props();

  let submitting = $state(false);
  let name = $state('');
  let email = $state('');
  let type = $state('general');
  let message = $state('');
</script>

<svelte:head>
  <title>Contact — airways.gg</title>
  <meta name="description" content="Get in touch with the airways.gg team." />
</svelte:head>

<div class="container max-w-lg py-12 px-4">
  <h1 class="text-2xl font-semibold mb-1">Contact</h1>
  <p class="text-muted-foreground text-sm mb-8">Send a message to <span class="text-foreground">contact@airways.gg</span></p>

  {#if form?.success}
    <div class="rounded-lg border bg-card p-6 text-center">
      <p class="font-medium mb-1">Message sent</p>
      <p class="text-sm text-muted-foreground">Thanks for getting in touch. We'll get back to you soon.</p>
      <a href="/" class="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
        Back to flight board
      </a>
    </div>
  {:else}
    {#if !data.formspreeUrl}
      <div class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-6">
        The contact form is not currently available.
      </div>
    {/if}

    {#if form?.error}
      <div class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-6">
        {form.error}
      </div>
    {/if}

    <form
      method="POST"
      use:enhance={() => {
        submitting = true;
        return async ({ update }) => {
          submitting = false;
          await update();
        };
      }}
      class="space-y-5"
    >
      <div class="space-y-1.5">
        <label for="name" class="text-sm font-medium">Name</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          bind:value={name}
          placeholder="Your name"
          class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div class="space-y-1.5">
        <label for="email" class="text-sm font-medium">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          bind:value={email}
          placeholder="you@example.com"
          class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div class="space-y-1.5">
        <label for="type" class="text-sm font-medium">Enquiry type</label>
        <select
          id="type"
          name="type"
          bind:value={type}
          class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="general">General enquiry</option>
          <option value="feature">Feature request</option>
          <option value="bug">Bug report</option>
        </select>
      </div>

      <div class="space-y-1.5">
        <label for="message" class="text-sm font-medium">Message</label>
        <textarea
          id="message"
          name="message"
          required
          bind:value={message}
          placeholder="Your message..."
          rows="5"
          class="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        ></textarea>
      </div>

      <button
        type="submit"
        disabled={submitting || !data.formspreeUrl}
        class="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Sending...' : 'Send message'}
      </button>
    </form>
  {/if}
</div>
