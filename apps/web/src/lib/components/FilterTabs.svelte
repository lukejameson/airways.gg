<script lang="ts">
  interface Props {
    activeTab: string;
  }
  
  let { activeTab = $bindable() }: Props = $props();
  
  const tabs = [
    { id: 'all', label: 'All', icon: '✈️' },
    { id: 'departures', label: 'Departures', icon: '🛫' },
    { id: 'arrivals', label: 'Arrivals', icon: '🛬' },
  ];
</script>

<div class="mb-6 flex space-x-1 rounded-lg bg-muted p-1">
  {#each tabs as tab}
    <button
      class="flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all {activeTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
      onclick={() => activeTab = tab.id}
    >
      <span>{tab.icon}</span>
      <span>{tab.label}</span>
    </button>
  {/each}
</div>