# Ticket ordering diagnosis — 2026-09-23

Branch: `perf/ticket-ordering-diagnosis`, based on PR #247 commit `53ed46333`.

## Scope and method

Measured the existing localhost:5173 development server in a separate T3 Chromium tab, using the 65-ticket project from the reported issue. Sprint grouping was selected and all eight sprint sections were collapsed. No backend, database, application source, or server configuration was changed. Browser requests were read-only GETs; ordering controls changed only the diagnostic tab's URL.

Measurements use `performance.now()`, Resource Timing, a Long Tasks observer, and a MutationObserver comparing ticket-list text after synthetic menu clicks. They measure click-to-first **DOM order change**, including clipped rows, not paint completion or INP. They do not isolate React rendering from decoding, layout, or other main-thread work. These are small local development samples, not production benchmarks.

Raw samples: [2026-09-23-ticket-ordering.json](./2026-09-23-ticket-ordering.json) (local output, ignored by the repository). Reusable probe: [2026-09-23-ticket-ordering.browser.js](./2026-09-23-ticket-ordering.browser.js).

## Results

| Measurement | Result |
| --- | --- |
| Sprint-sections GET, 7 warm samples | median 14.8 ms; range 11.3–29.2 ms |
| Three concurrent GETs (sprint sections, status sections, count), 7 warm samples | median 19.1 ms; range 16.8–24.0 ms |
| First sample before each warm run | sprint-sections GET 67.8 ms; three-request batch 28.9 ms |
| New UI ordering, 3 uncached samples | first DOM change 99.2–153.7 ms; 3 requests each |
| Cached UI ordering, 3 samples | first DOM change 89.6–98.5 ms; 0 requests |
| Long main-thread tasks on uncached UI ordering | 59–86 ms |
| Mounted ticket rows inside collapsed sprint sections | 57 of 65 |

A second UI run reproduced the three-request pattern: four uncached sorts took 102.4–212.8 ms to first DOM change, with 54–92 ms main-thread tasks. A cached sort took 97.1 ms with no requests. This variation reinforces reporting ranges rather than treating the initial samples as a fixed latency. Selecting the already-active Title option produced no DOM change and is excluded from those figures.

Initial page loading produced a 659 ms sprint-sections resource duration, but repeat requests were much faster. Do not mix initial module loading and page startup with steady-state sorting.

## Findings

### Count cache keys include irrelevant ordering

`useServerTicketCounts` passes the whole `TicketListQuery` to `countsRequest`, which returns it unchanged. Its `TicketCountQuery` type annotation does not remove extra runtime properties. The atom family consequently distinguishes sort values, although the HTTP encoder drops sorting from the count request. Three uncached sort changes each fetched the exact same `/tickets/count` URL.

Relevant files: `apps/frontend/src/components/TicketList/toolbar/counts.ts` and `apps/frontend/src/features/tickets/atoms/ticketCounts.ts`.

### Both grouping variants fetch on a sort change

`TicketListContent` retains status and sprint sections in React Activity boundaries. The observed requests include both `/tickets/sections` and `/tickets/sprint-sections`, even while sprint grouping is selected. Retaining the hidden view does not prevent this read work.

Relevant files: `apps/frontend/src/components/TicketList/index.tsx`, `BacklogView.tsx`, and `SprintSections.tsx`.

### Collapsed sections still contain mounted ticket rows

`SectionBody` collapses a CSS grid to zero height and applies `aria-hidden` and `inert`; it does not remove or suspend its children. `VirtualRows` receives no collapsed state and determines proximity using its own list rectangle. The collapsed sprint bodies contained 20 + 22 + 3 + 1 + 5 + 6 mounted rows. Hidden status lists had zero mounted rows, but still fetched their data.

Cached sorting takes approximately 90–100 ms without network traffic, so network/server work cannot explain that part of the delay. Updating clipped ticket rows is a strong optimization candidate, but a controlled rendering experiment or CPU profile is still needed to attribute the main-thread time precisely.

Relevant files: `apps/frontend/src/components/TicketList/SectionBody.tsx`, `SectionList.tsx`, `VirtualRows.tsx`, and `SprintSections.tsx`.

## Next experiments

1. Exclude non-count fields from count identity and confirm sort changes issue no count GET.
2. In an isolated frontend build, suppress ticket rendering for collapsed sections and repeat cached sorts. Preserve the established instant expand/collapse behavior when evaluating the tradeoff.
3. Compare fetching only the active grouping against the retained-view behavior, including the cost when switching grouping.
4. Profile the remaining main-thread work and compare a production build before investing in database-query restructuring.

Changing retention/lazy-loading behavior is a data-flow decision to agree on before implementation. The initial diagnosis below was followed by the implementation documented at the end of this report.

## Reproduction

1. Open the local backlog in a separate authenticated browser tab, select sprint grouping, and collapse every section.
2. Open View options. Set `performance.setResourceTimingBufferSize(5000)` and clear old resource timings after page load; otherwise initial Vite module requests can exhaust the default buffer and hide API samples.
3. Measure consecutive direct fetches to `/tickets/sprint-sections` with alternating title/priority ascending sort, then compare the same request with parallel `/tickets/sections` and `/tickets/count` GETs. Await response bodies, discard the first sample, and report distributions.
4. Run the companion browser probe from DevTools with View options open. It selects Title, Updated, ID, Created, Priority, Title, records request timings and list mutations, disconnects its observers, and restores the original ordering selection.
5. Distinguish newly fetched orderings from previously cached ones; the atom TTL is two minutes. Do not treat direct fetches as warming the atom cache.

## Follow-up implementation and comparison

Implemented on the same branch in `/tmp/pp-ordering-perf`, with a separate Vite frontend at localhost:5174 and the existing read-only API paths. The original localhost:5173 frontend was not modified.

- `countsRequest` now decodes through the type-side `TicketCountQuery` schema. This strips runtime-only sort, cursor, and view properties while preserving all count filters, including `Date` values.
- `SectionBody` uses React Activity to hide content and pause its effects while retaining component state. A memo comparator skips parent-driven content changes while both previous and next states are collapsed; reopening always receives the latest children. The existing instant CSS grid switch stays in place.

A simple unmount experiment reduced sorting cost but made every reopen of the 20-ticket section cost 120–136 ms, so it was discarded. Activity alone preserved state and made repeat opening fast, but still performed expensive background work once rows had been retained. Skipping collapsed parent updates removed those measured background tasks as well.

The final comparison uses the ordering control's text update as a stable DOM timing marker (not completion of a server request or painted ticket order). A 10 ms timer samples main-thread stalls over 650 ms. This replaces the initial ticket-text marker, since frozen hidden rows deliberately do not change when sorting. Animation-frame measurements were discarded because frame scheduling in the embedded preview was inconsistent. These are local development measurements and do not establish production INP.

| Metric | Baseline | Final |
| --- | --- | --- |
| Cached sort to ordering-label DOM update | 53.5–101.2 ms, 10 samples | 19.6–35.0 ms, 9 changed-order samples |
| Median of last five cached samples | 87.8 ms | 20.9 ms |
| Worst timer delay in those samples | 110.6 ms | 27.6 ms |
| New-sort API requests | status sections + sprint sections + count | status sections + sprint sections |
| Retained collapsed sprint rows in final verification | 57 updating under CSS clipping | 57 retained, parent updates skipped |

The final run opened and collapsed every sprint first so it exercised retained rows, rather than benefiting only from empty virtualizers. The baseline also retained 45 rows in the previously opened hidden status grouping; the final run did not retain those rows. This is not a production-controlled CPU comparison, but both the intermediate single-change experiment and the final retained-row run show the collapsed-content cost.

First open after changing the hidden ordering took 63.6 ms for 20 tickets, then reopening without a data change took 20.8 ms; collapse took about 13 ms. The latest title order was verified in the displayed rows. Deferring hidden work still means applying accumulated changes on reopen; it does not make that work free.

The unchanged hidden grouping still fetches data. This patch deliberately does not change grouping retention, server pagination, or query contracts.

Validation: count identity and filters, hidden subscription cleanup, skipped hidden renders, retained local state, latest props on reopening, existing collapse behavior, snapshot retention, and scroll anchoring are covered by 17 focused tests. All 17 focused tests and frontend typecheck pass. Targeted lint exits successfully with one pre-existing mock-type warning.

Local raw comparison: `2026-09-23-ticket-ordering-comparison.json` (ignored benchmark output). Run `2026-09-23-ticket-ordering-comparison.browser.js` with View options open on the local diagnostic tab to repeat the label/timer measurements. It leaves the tab ordered by Priority in its current direction; it changes no ticket data.
