# T-390 first-render experiments

Base: `c53859875`, with the project-view server fallbacks removed. Experiment branch: `work/T-390-first-render`.

## Measurement

Production Vite build, Chromium through Playwright, bench org `bench`, `mid-a` (50k) and `huge` (200k). Every first-open run uses a new persistent browser profile, empty OPFS and empty boot cache. Authentication uses the existing bench cookie. The requested URL is the backlog with `group=status`.

First render is navigation to the first inserted ticket row, checked against Playwright's visible-row wait. Complete-copy time is navigation to the final `local write publish` timing. Sync-to-publish subtracts the first sync request. Read p95 is the worker's existing timed-read instrumentation during startup and the following three seconds; it includes connection waits. Timing instrumentation uses the existing local-shadow flag, which also starts a comparison pull after sync. These are not isolated idle read microbenchmarks.

The control and candidate are alternated, reversing their order on the second round. Each project has three runs of each build. The supplied 3.2 s / 16.5 s baseline starts at the first sync request, not navigation; it cannot be compared directly with first-render numbers.

Machine load changed substantially during the session. Raw results preserve the load average for every run. Absolute timings from separate experiment batches are not reliable evidence of an improvement. The alternating comparison is the basis for retaining changes.

## Candidates

- 4 KB pages instead of 64 KB: rejected. Increased OPFS overhead outweighed the smaller B-tree pages in these runs. Existing databases were not vacuumed or rewritten.
- JSON row batches through `json_each`, replacing per-field bindings: rejected. Repeated extraction of the ticket's columns cost more than it saved. A focused native SQLite comparison also found roughly ten times the insertion cost. The 200k browser experiment was stopped after two runs; it is not reported as a three-run median.
- Sort indexes built after staging: candidate. Migration 0010 replaces the seven global ticket sort indexes with partial indexes per copy. Structural indexes remain global. Staging writes avoid the seven sort indexes, then build them before the existing atomic publish. The writer yields between builds. Retiring a copy drops its sort indexes. Interrupted builds can resume because each index is created atomically and existing indexes are reused.

## Architectural and semantic review

The candidate changes local index ownership and adds local migration 0010. It retains the shared tables and copy ids, snapshot protocol, full-copy readiness, pending edit overlays, catch-up, and the atomic publication transaction. It introduces no Postgres migration, dependency or server endpoint.

There are seven sort indexes per published copy, so schema size grows with the number of cached projects. An individual SQLite index build is synchronous and cannot yield halfway through; yielding between indexes does not guarantee a sub-50 ms wait for an unrelated read. Existing copies keep their indexes while a replacement loads.

## Next direction

The one-second target needs a larger change than tuning indexed row insertion. The next experiment should use a database per project and a server-produced, compressed SQLite snapshot, keyed by snapshot generation and GitHub visibility, followed by normal change-log catch-up. That would let the browser install database pages directly. It must preserve pending edits separately from the replaceable synced database and validate interrupted download/import, reload, multi-tab handoff and revoked GitHub access. It does not need a server-rendered view endpoint.
