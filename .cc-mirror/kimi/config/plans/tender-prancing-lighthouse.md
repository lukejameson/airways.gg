# Stats Page Date Filter Enhancement

## Context
The stats page currently has a simple date range filter with three options: "All time", "90 days", and "30 days". The user wants to add a "Custom" option that allows users to specify their own date range using date pickers.

## Current Implementation

### Files Involved
- `/home/coder/repos/airways.gg/apps/web/src/routes/stats/+page.svelte` - Main stats page UI
- `/home/coder/repos/airways.gg/apps/web/src/routes/stats/+page.server.ts` - Server-side data loading with SQL filters
- `/home/coder/repos/airways.gg/example/DateRangeFilter.svelte` - Example component for reference
- `/home/coder/repos/airways.gg/example/DateTimePicker.svelte` - Example date picker component for reference

### Current Date Filter (UI)
Located in `+page.svelte` around line 647:
```svelte
<div class="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
  {#each [['all', 'All time'], ['90', '90 days'], ['30', '30 days']] as [val, label]}
    <button onclick={() => goto(`/stats?range=${val}`, { noScroll: true })} class="...">{label}</button>
  {/each}
</div>
```

### Current Date Filter (Server)
Located in `+page.server.ts` lines 7-12, 48-52:
```typescript
const range = url.searchParams.get('range') ?? '90';
const dateFilter =
  range === '30'
    ? sql`AND f.flight_date >= CURRENT_DATE - INTERVAL '30 days'`
    : range === '90'
      ? sql`AND f.flight_date >= CURRENT_DATE - INTERVAL '90 days'`
      : sql``;
```

## Proposed Changes

### 1. Server-Side Changes (+page.server.ts)

Add support for custom date range via `dateFrom` and `dateTo` URL parameters:

1. Read `dateFrom` and `dateTo` parameters from URL
2. Modify `dateFilter` logic to handle custom ranges:
   - If `range=custom` and both dates provided: use explicit date range
   - Keep existing '30', '90', 'all' logic
3. Update `routeMinFilter` to also respect custom date ranges
4. Update `wxDateFilter` similarly

### 2. UI Changes (+page.svelte)

1. Add `dateFrom` and `dateTo` derived state from `data`
2. Modify the range button group to include 'Custom' option:
   - Change from: `[['all', 'All time'], ['90', '90 days'], ['30', '30 days']]`
   - To: `[['all', 'All'], ['90', '90 Days'], ['30', '30 Days'], ['custom', 'Custom']]`
3. When 'Custom' is selected, show date range inputs using a similar pattern to the example
4. Add `currentRange` derived value if not already present (used in template)
5. Create `filterUrl` integration for custom date range

### 3. New/Reused Components

**Option A: Use Inline Date Inputs (Simpler)**
- Add native date inputs directly in the stats page when custom mode is active
- Style to match existing filter aesthetics

**Option B: Extract Reusable Component**
- Create a simplified date range picker component based on the example
- Use native date inputs for mobile compatibility

### Recommended Approach: Option A (Inline)

Since the example components use Flatpickr (external dependency), and the stats page already has a working filter pattern, I recommend:

1. Add inline date inputs that appear below the range buttons when 'custom' is selected
2. Use native `<input type="date">` for simplicity and mobile compatibility
3. Style to match existing filter panel aesthetics (rounded borders, consistent padding)

## Implementation Details

### UI Flow
1. User clicks "Custom" button → URL changes to `?range=custom`
2. Date inputs appear below the range buttons
3. User selects dates and clicks "Apply" → URL updates to `?range=custom&dateFrom=2024-01-01&dateTo=2024-01-31`
4. Server uses the date range in queries

### Styling
- Match existing filter button styles: `rounded-lg border bg-muted/40 p-1`
- Date inputs should match: `rounded-full border border-border bg-background`
- Use consistent spacing: `gap-2`, `p-1`, etc.

### URL Parameter Handling
- `range=custom` triggers custom mode
- `dateFrom` and `dateTo` specify the range (YYYY-MM-DD format)
- Changing from custom to preset clears date parameters

## Verification Steps

1. **Test preset ranges still work:**
   - Click "All", "90 Days", "30 Days" → verify data updates correctly

2. **Test custom range:**
   - Click "Custom" → date inputs appear
   - Select from/to dates → click Apply
   - Verify URL shows `?range=custom&dateFrom=...&dateTo=...`
   - Verify stats reflect the selected range

3. **Test edge cases:**
   - From date > To date (should handle gracefully)
   - Future dates
   - Very large date ranges
   - Mobile responsiveness

4. **Verify server-side:**
   - Check SQL queries include date range correctly
   - Verify `routeMinFilter` also respects custom dates

## Files to Modify

1. `/home/coder/repos/airways.gg/apps/web/src/routes/stats/+page.server.ts`
   - Add `dateFrom`/`dateTo` param reading
   - Update `dateFilter` logic
   - Update `routeMinFilter` and `wxDateFilter`
   - Return dateFrom/dateTo in load result

2. `/home/coder/repos/airways.gg/apps/web/src/routes/stats/+page.svelte`
   - Add `filterDateFrom`/`filterDateTo` derived state
   - Update range button list to include 'custom'
   - Add conditional date input UI
   - Add `currentRange` derived state if missing
   - Update `filterUrl` helper or create new helper for date ranges
