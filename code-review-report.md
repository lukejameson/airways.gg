# UI/UX Review Report

**Target:** airways.gg (SvelteKit 5 web app)
**Languages:** Svelte 5 (runes), TypeScript, CSS (Tailwind + custom properties)
**Date:** 2026-06-02

## Executive Summary

- Total pages reviewed: 6
- Total components reviewed: 7
- Total issues found: 23
  - Critical: 0
  - High: 4
  - Medium: 12
  - Low: 7

The site is well-crafted overall — strong typography, thoughtful loading skeletons, responsive design, and comprehensive flight data presentation. The main gaps are the absence of dark mode, some missing interaction affordances, and the stats page being overly dense.

---

## Findings

### High

#### 🔴 No Dark Mode Implementation

**Severity:** high
**Files:** `app.css`, all page/component `.svelte` files
**Confidence:** high

The CSS custom properties define a complete light-mode color system, and 3 isolated `dark:` Tailwind classes exist in the codebase (auto-advance banner, status icons in flight detail), but there is no `@media (prefers-color-scheme: dark)` block, no dark variant of any CSS variable, and no theme toggle. The entire site is light-only. For an aviation tracker used at all hours (early morning departures, late-night arrivals), this is a significant gap.

**Remediation:** Add a `:root.dark` or `@media (prefers-color-scheme: dark)` block to `app.css` with inverted color values. Add a theme toggle in the header (sun/moon icon). The aviation theme maps well to dark backgrounds (navy/indigo tones).

---

#### 🔴 Stats Page Density — Information Overload

**Severity:** high
**Files:** `src/routes/stats/+page.svelte` (1,682 lines)
**Confidence:** high

The stats page packs hero cards, 8 "At a Glance" insight cards, cumulative delay impact, worst days by delay, daily OTP trend chart, day-of-week chart, departure hour chart, delay distribution chart, worst routes table, flight numbers table, busiest days table, monthly breakdown table, aircraft usage, worst weather days, wind impact, visibility impact, and top individual delays — all on one page with no progressive disclosure. Users must scroll through thousands of pixels to find what they care about.

**Remediation:** Add a sticky sidebar table of contents with anchor links to each section. Consider collapsing secondary sections (aircraft usage, visibility impact) behind expandable toggles, or splitting into tabbed views (Overview / Routes / Weather / Aircraft).

---

#### 🔴 Stats Page Route Filter UX

**Severity:** high
**Files:** `src/routes/stats/+page.svelte`
**Confidence:** high

The route filter has two tiers: "Top 10 routes" shown as pills, and an "Other routes" search input that shows a dropdown. This two-tier system is non-obvious — users may not realize there are more routes behind the search box. The custom date range toggle is also hidden inside a pill selector: tapping "Custom" replaces the range pills with date inputs, which is clever but undiscoverable.

**Remediation:** Show all routes in a scrollable multi-select list with a search filter at the top (single unified control). For the date range: use a dedicated date range picker component rather than the hidden toggle pattern.

---

#### 🔴 No Reduced Motion Support

**Severity:** high
**Files:** `app.css`, `FlightCardSkeleton.svelte`
**Confidence:** high

The skeleton loading animation uses `animate-pulse` (CSS `@keyframes pulse`), and the live indicator dot uses `animate-pulse`. There is no `@media (prefers-reduced-motion: reduce)` rule anywhere. For users with vestibular disorders, the pulsing animations can cause discomfort.

**Remediation:** Wrap all animations in a `@media (prefers-reduced-motion: no-preference)` block, or add `@media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation-duration: 0.01ms !important; } }` to `app.css`.

---

### Medium

#### 🟡 Missing Search Autocomplete / Suggestions

**Severity:** medium
**Files:** `src/routes/+page.svelte`, `src/routes/search/+page.svelte`
**Confidence:** high

Both search inputs require exact text matching. No autocomplete, no suggestions dropdown, no "did you mean?" hints. For a flight tracking app, users benefit from being able to type "LGW" and see matching flights without knowing the exact flight number or format.

**Remediation:** Add a debounced suggestion endpoint that returns matching flight numbers, airport codes, and airport names as the user types. Show results in a dropdown below the search input.

---

#### 🟡 No Visible Breadcrumbs on Flight Detail

**Severity:** medium
**Files:** `src/routes/flights/[id]/+page.svelte`
**Confidence:** medium

The flight detail page has JSON-LD structured breadcrumbs for SEO but no visible breadcrumb UI. The "← Back" link goes to the board but doesn't show the navigation path. Users who deep-link to a flight have no visible context about where they are in the site hierarchy.

**Remediation:** Add a visible breadcrumb trail: `Home > Flights > GR602` above the flight header, replacing or augmenting the "← Back" link.

---

#### 🟡 Flight Detail — Long Scroll, No In-Page Navigation

**Severity:** medium
**Files:** `src/routes/flights/[id]/+page.svelte` (1,068 lines)
**Confidence:** medium

The flight detail page has 7+ distinct sections (header, status alerts, time cards, map, rotation history, weather, details, status history) with no way to jump between them. Users on mobile must scroll through the map and rotation table to reach weather or flight details.

**Remediation:** Add a sticky mini-nav or anchor link row below the flight header with labels like "Status · Map · Rotation · Weather · Details · History".

---

#### 🟡 Header Navigation — No Active State, No Search Link

**Severity:** medium
**Files:** `src/routes/+layout.svelte`
**Confidence:** high

The header has Stats, Contact, and Support Us links with no active/current-page indicator. There is no link to the dedicated `/search` page. Users must know the search page exists or use the inline search on the home page.

**Remediation:** Add an `aria-current="page"` attribute and a visual active state (e.g., text color or underline) to the current page's nav link. Add a Search link to the header nav.

---

#### 🟡 Contact Form — No Character Count, No Spam Protection Visible

**Severity:** medium
**Files:** `src/routes/contact/+page.svelte`
**Confidence:** low

The message textarea has no character counter, no maxlength, and no visible spam protection (honeypot, CAPTCHA, or rate-limit indicator). The form submits to Formspree which provides backend spam filtering, but users may not know this.

**Remediation:** Add a character count (`{message.length}/1000`) below the textarea. Consider adding a hidden honeypot field.

---

#### 🟡 Stats Disclaimer — Blocks Entire Page on Every Visit

**Severity:** medium
**Files:** `src/routes/stats/+page.svelte`
**Confidence:** medium

A full-screen modal with a "Before you explore" disclaimer blocks all interaction until dismissed. While the content (not 100% accurate, not a witch hunt) is appropriate, the implementation is intrusive. If the user clears localStorage, it reappears.

**Remediation:** Show the disclaimer as a dismissible banner at the top of the stats page (like the roads.gg banner on the home page) rather than a blocking modal. Keep the modal for first visit, but make it less aggressive.

---

#### 🟡 Mobile — Weather Strip Hidden

**Severity:** medium
**Files:** `src/lib/components/FlightCard.svelte`
**Confidence:** medium

The weather strip (dep/arr weather side by side) on `FlightCard` is hidden on mobile (`hidden sm:flex`). Mobile users lose the weather context entirely. This is a deliberate trade-off for card density, but weather is particularly relevant for Guernsey flights.

**Remediation:** Show a condensed one-line weather summary on mobile (e.g., "GCI ☀️ 18°C → LGW ☁️ 15°C") using smaller text and icons.

---

#### 🟡 No `aria-live` Regions for Dynamic Content

**Severity:** medium
**Files:** `src/routes/+page.svelte`, `src/lib/components/DelayCounter.svelte`
**Confidence:** medium

The live delay counter updates every 60 seconds, and the flight board auto-refreshes every 5 minutes. Screen reader users receive no announcement of these updates. The `aria-live` attribute is not used anywhere.

**Remediation:** Add `aria-live="polite"` to the delay counter container and the flight board results container so assistive technology announces status changes.

---

#### 🟡 Stats Page — Charts Have No Fallback for Non-JS or Loading

**Severity:** medium
**Files:** `src/routes/stats/+page.svelte`
**Confidence:** low

Chart.js canvases render nothing until the Chart.js module is dynamically imported and initialized. There's no skeleton or placeholder during chart loading, and no accessible data table alternative for screen readers.

**Remediation:** Add chart skeletons (matching bar/line chart dimensions). Include a hidden (visually-hidden) data table for each chart for screen reader accessibility.

---

#### 🟡 Share Button — Desktop Fallback UX

**Severity:** medium
**Files:** `src/routes/flights/[id]/+page.svelte`
**Confidence:** medium

On desktop (no Web Share API), clicking Share silently copies the URL to clipboard and shows a transient "Copied!" message. The user gets no confirmation of what was copied. On mobile, `navigator.share()` may fail silently with no user feedback.

**Remediation:** On desktop, show a small toast: "Link copied to clipboard". On share failure, show a fallback with the URL visible for manual copying.

---

#### 🟡 Auto-Advance Banner — Could Be Missed

**Severity:** medium
**Files:** `src/routes/+page.svelte`
**Confidence:** low

When all today's flights have completed and tomorrow's schedule is shown instead, a blue banner appears: "Today's flights have all completed. Showing tomorrow's schedule instead." This is informative but could be overlooked because the date nav is at the top of the page, and users may scroll past the banner.

**Remediation:** Make the banner more visually distinct (use the amber/gold tone rather than blue). Consider adding a "Switch back to today" button in the banner.

---

### Low

#### 🟢 No Print Styles

**Severity:** low
**Files:** `app.css`, all pages
**Confidence:** high

No `@media print` rules exist anywhere. Flight information and stats are often printed for reference. The page would print with all UI chrome (header, footer, filters, shadows, rounded corners).

**Remediation:** Add minimal print styles: hide header/footer/filters/buttons, show flight data in a clean table format, remove shadows and rounded corners.

---

#### 🟢 Recently Viewed — No Timestamps

**Severity:** low
**Files:** `src/routes/+page.svelte`
**Confidence:** low

The "Recently viewed" section shows flight numbers and routes but not when they were viewed. A flight viewed 3 weeks ago looks identical to one viewed 5 minutes ago.

**Remediation:** Show a relative timestamp ("2h ago", "Yesterday") on each recently-viewed chip.

---

#### 🟢 Map — No Loading Indicator During Dynamic Import

**Severity:** low
**Files:** `src/routes/flights/[id]/+page.svelte`
**Confidence:** low

When the map toggle is clicked, `FlightMapComponent` is dynamically imported. Between the click and the import completing, there's a brief "Loading map…" text, but it has no animated indicator (spinner, skeleton). The transition from collapsed summary to loading text is abrupt.

**Remediation:** Add a spinner icon or skeleton placeholder alongside the "Loading map…" text.

---

#### 🟢 Error Page — "Go Back" Button Uses `window.history.back()`

**Severity:** low
**Files:** `src/routes/+error.svelte`
**Confidence:** low

The "Go back" button calls `window.history.back()`. If the user arrived via a direct link or external referrer, going back may leave the site entirely (to a search engine or social media). The alternative ("Go to flight board") is present but de-emphasized.

**Remediation:** Make "Go to flight board" the primary CTA and "Go back" the secondary. Or check `document.referrer` and only show the back button when the referrer is the same origin.

---

#### 🟢 Stats — "On-Time Rate" Card Uses Filter Threshold Without Context

**Severity:** low
**Files:** `src/routes/stats/+page.svelte`
**Confidence:** low

The hero "On-Time Rate" card shows the % based on the current `threshold` filter (default: delay ≤ 15 min). The subtitle mentions "delay ≤ 15 min" but changing the threshold via the filter panel changes this value without making it clear that the threshold changed.

**Remediation:** Show the threshold value more prominently in the card, e.g., "On-Time Rate (≤15 min delay)".

---

#### 🟢 No Favicon `.ico` for Legacy Browsers

**Severity:** low
**Files:** `src/app.html`
**Confidence:** low

Only PNG favicons (16×16, 32×32) and Apple touch icons are declared. No `.ico` fallback for older browsers or tools that look for `/favicon.ico`.

**Remediation:** Add `<link rel="icon" type="image/x-icon" href="/favicon.ico" />`.

---

#### 🟢 Flight Detail — Section Headers Use `uppercase tracking-wide` Inconsistently

**Severity:** low
**Files:** `src/routes/flights/[id]/+page.svelte`
**Confidence:** low

Section headers vary: "Flight Details" and "Status History" use uppercase tracking-wide, while "Aircraft Location" uses the same. But "Today's rotation" and weather headers use sentence case. The inconsistency is minor but noticeable.

**Remediation:** Standardize all section headers to either uppercase tracking-wide or sentence case with font-semibold.

---

## What's Working Well

These are areas where the UX is notably strong and should be preserved:

- **Loading skeleton fidelity** — `FlightCardSkeleton` matches `FlightCard` layout pixel-for-pixel including the weather strip and divider, so there's zero layout shift on load.
- **Typography & Branding** — Space Grotesk self-hosted with proper subsetting, `font-display: optional`, and OpenType features gives the site a distinctive, polished feel.
- **Responsive date navigation** — Desktop shows centered prev/next arrows; mobile shows a full-width row. Both are touch-friendly (44px min-height).
- **Delay reasoning** — Extracting delay reasons from scraper status messages (weather, holding, indefinite) and showing contextual alert cards with appropriate icons and colors is excellent.
- **Aircraft rotation history** — Showing the day's full rotation with desktop table / mobile card views, current flight highlighted, and scroll-to-current on expand is thoughtful.
- **Fog/low-visibility warnings** — The visibility check with fog icon and distance display adds real value for Guernsey flights.
- **iOS PWA push guidance** — Detecting iOS Safari non-standalone mode and showing "Add to Home Screen" instructions is a good progressive enhancement.
- **Recently viewed persistence** — Mirroring from localStorage to a cookie so the server can SSR the section prevents pop-in.
- **Estimated time expiry** — The `estimatedTimeExpired` logic that falls back to scheduled time when estimates are stale prevents showing outdated data.
- **Cumulative delay impact** — Economic cost estimates (£11.50–£25/hr) with passenger-hour calculations make the data relatable.
- **Skip-to-content link** — Properly implemented with `sr-only` and `focus:not-sr-only`.
- **SEO** — BreadcrumbList structured data, Open Graph, Twitter cards, canonical URLs, and dynamic per-page titles/descriptions.

---

## Remediation Priority

1. **Add dark mode** — define dark CSS custom properties and a theme toggle in the header.
2. **Add `prefers-reduced-motion` support** — one `@media` block in `app.css`.
3. **Simplify stats page** — add TOC sidebar, collapse secondary sections, unify route filter.
4. **Add search autocomplete** — debounced suggestions dropdown for both search inputs.
5. **Improve flight detail navigation** — visible breadcrumbs and in-page section jump links.
6. **Fix stats disclaimer** — convert modal to dismissible banner.
7. **Add `aria-live` regions** — announce dynamic content updates to screen readers.
8. **Show weather on mobile cards** — condensed one-line format.
9. **Add chart skeletons and accessible data tables** — for stats page charts.
10. **Address remaining medium/low items** — share UX, print styles, recently-viewed timestamps, etc.

---

## File-by-File Breakdown

| File | Issues | Max Severity |
|------|--------|--------------|
| `src/routes/stats/+page.svelte` | 6 | high |
| `src/routes/+page.svelte` | 4 | medium |
| `src/routes/flights/[id]/+page.svelte` | 5 | medium |
| `src/routes/search/+page.svelte` | 1 | medium |
| `src/routes/contact/+page.svelte` | 1 | medium |
| `src/routes/+layout.svelte` | 1 | medium |
| `src/app.css` | 2 | high |
| `src/lib/components/FlightCard.svelte` | 1 | medium |
| `src/lib/components/DelayCounter.svelte` | 1 | medium |
| `src/routes/+error.svelte` | 1 | low |
| `src/lib/components/FlightMap.svelte` | 1 | low |

---

*Generated by code-review skill v3.0.0*
