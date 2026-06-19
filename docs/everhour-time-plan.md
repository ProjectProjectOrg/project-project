# Everhour Time Tracking — Implementation Plan (T-9)

Status: agreed design, pre-implementation. Builds on the structural integration in
`b52f754` (branch `feat/T-9-time-management-everhour`), which is **unmerged scaffolding** —
no shipped data to migrate.

## North star

**The `Sprint X — <work-type>` task totals in Everhour are 100% accurate.** Per-ticket
attribution is best-effort and explicitly secondary to that. We do not compete with
Everhour on time management — Everhour mints every second; PP is a thin
**orchestration + attribution + reporting** layer on top.

Concretely:

- **Everhour owns the seconds.** Its timer engine / time records are the source of truth.
  PP never fabricates a duration Everhour didn't generate, so PP can't corrupt the totals.
- **PP owns the ticket dimension** — which ticket a time record belongs to — plus the UX
  for starting/stopping and a rebuildable index for its own reporting.
- **Everhour time records are sacred.** No PP action ever deletes logged hours; the worst
  PP does is close/archive.

## The model (decision: "Model B")

Everhour gives two grouping levels above a time record: `Project → Section → Task → time`.
We spend both: project = PP project, section = sprint. The remaining grain — the **task** —
is `(sprint × work-type)`, not the ticket.

| ProjectProject | → | Everhour |
| --- | --- | --- |
| Project | → | Project (board) — PP creates/owns it; reuses its managed one if present |
| Sprint (group `kind:"sprint"`) | → | Section |
| Work-type (per org config) | → | **Task** named `"{sprint} — {work-type}"`, inside the sprint section |
| (ticket) | → | not an Everhour entity; lives only in PP's attribution index |

Default work-type set (per org, seeded on connect): **Development, Design, Project
Management, Meetings & Workshops, Testing.**

Per-ticket time is a **rebuildable index over Everhour's records**, not an independent
ledger. Attribution is recoverable from the Everhour record comment (see below).

## Capture flows

Everhour timers are **per-user** and **single-active-per-user, account-wide**. PP mirrors
that exactly.

### Start / switch timer
1. User hits "Start" on a ticket (or a sprint, see ticket-less below) and picks a work-type.
2. PP resolves `ticket → its sprint → section → (work-type) task`.
3. PP calls Everhour **Start Timer** (`POST /timers`) with that task and a
   `comment` stamped `"<ticket-id> — <title>"` (+ the user's note for manual entries).
   Everhour auto-stops any previously running timer for that user.
4. PP writes the **active-timer** row (one per user).

### Stop
- **In PP** → PP calls **Stop Timer**, gets the created time record back synchronously
  (id + seconds) → attribute to the tracked ticket → write the attribution row → clear the
  active-timer row.
- **In Everhour** → `api:time:updated` webhook fires → PP matches it to the active-timer row
  by `(everhourUserId, everhourTaskId)` → attribute → clear. Backstop: poll
  `/timers/current` on ticket/sprint page load to catch missed webhooks.

### Manual "Log time" (v1)
After-the-fact entry: `duration + date + work-type + free-text note`, on a ticket or a
sprint. PP calls Everhour **Add Time** (`POST /time`) on the work-type task with the stamped
comment, then attributes it — same path as a timer stop. **No edit/delete of past entries in
PP** — those happen in Everhour and flow back via `api:time:updated`.

### Ticket-less (sprint-level) logging — covers Meetings & PM
A second entry point on the sprint view: Start/Log against `sprint + work-type` with **no
ticket** (`ticketId = null`). Same code path, lands on the same work-type task, just
unattributed to a ticket. Low-commitment: drop it if it proves awkward.

### Work-type default
Picker defaults to the **last work-type used on that ticket**, falling back to the **org
default** (first / `isDefault`). No per-ticket work-type field.

## Connection model

Two layers:
- **Project-level** (admin-gated, as today): admin connects → PP creates/owns the Everhour
  project, sections, and work-type tasks using the admin's key.
- **Per-user**: each member links their **own** Everhour key (`user_everhour_integration`,
  already modelled) to track their own time.

Tracking UI is visible to **any project member**. If the member hasn't connected their
personal Everhour, the Start/Log controls show an **inline connect prompt** that captures
the API key right there (reuses the existing `connectProfile` verify path), then proceeds.
Project-membership-in-Everhour edge: surface Everhour's error verbatim; don't auto-provision.

## Data model (new tables)

- **`everhour_work_type_task_link`** — replaces `everhour_task_link`. Keyed by
  `(projectIntegrationLinkId, groupId, workTypeKey)` → `everhourTaskId`, `name`, `status`,
  `lastSyncedAt`.
- **`everhour_active_timer`** — one row per user. `everhourUserId, ticketId (nullable),
  projectIntegrationLinkId, everhourTaskId, workTypeKey, startedAt, everhourTimerId`.
  **Persisted** (a stop can arrive by webhook after a restart). Cleared on attribution.
- **`everhour_time_attribution`** — the rebuildable per-ticket index.
  `everhourTimeId (PK), ticketId (nullable), workTypeKey, everhourUserId, seconds, date,
  projectIntegrationLinkId`. Written on PP-initiated capture; `seconds` updated / row removed
  on `api:time:updated` / delete. PP reports read this.

Org config lives on `organization_integration` (provider=everhour) as a `config` jsonb:
`{ workTypes: [{ key, label, order, isDefault }] }`, seeded with the default set on connect.

`project_everhour_integration` gains the registered Everhour `webhookId` + per-project
webhook `secret`.

## Webhooks

- One webhook **per connected Everhour project**, filtered by `project`, event
  `api:time:updated`. Registered during `connectProject` (id stored), deleted on
  `disconnectProject`.
- Everhour does **not sign** webhooks → security via an **unguessable per-project secret in
  the targetUrl path** (`/integrations/everhour/webhook/<secret>`).
- **Trust the payload** (guarded by the secret) in v1 — no re-fetch, no service key needed.
  If the payload proves too thin we revisit; `/timers/current` polling + manual sync
  reconcile any drift. Blast radius of a bad event is a wrong *per-ticket* attribution; the
  Everhour totals are untouched.

## Structural sync, rebuilt

Rework the existing `bestEffortProjectSync`:
- **Retire** ticket→task (`syncTasks`, `everhour_task_link`).
- **Drop** the synthetic backlog section (sprint-only tracking).
- Sections = one per sprint. Work-type tasks created **eagerly on sprint create**, renamed
  on sprint rename.
- **Triggers shrink to sprint lifecycle only** (create/rename/complete/delete). Ticket
  mutations no longer trigger Everhour sync. Ticket→sprint assignment changes nothing
  structurally; resolution happens at capture time.
- **Sprint complete** → archive section + `close` its work-type tasks (time preserved;
  reopening reopens them).
- **Sprint delete** → never delete the Everhour tasks; archive/close and orphan them so
  hours survive. Optionally warn when the sprint has tracked time.

`FIXME` to leave at the reconcile site: when the org-settings work-type editor lands, edits
to the set must propagate to **open** sprints (rename→rename, add→create, remove→archive);
**completed sprints stay frozen**. (Deferred — explicitly user-requested comment.)

## UI surfaces (v1)

- **Global running-timer indicator** in the app shell — one per user (Everhour truth via
  `/timers/current`). If PP started it, clicking navigates to the ticket; if it was started
  in Everhour (no ticket link), just a "Stop timer" button.
- **Ticket page**: Start/Log controls + **per-ticket tracked time showing both the current
  user's time and the all-users total**, with an **"i" popover** explaining how the sync
  works (not an explicit "tracked in PP" label).
- **Sprint view**: ticket-less Start/Log entry point.
- Inline Everhour-connect prompt where tracking is attempted while disconnected.

## Out of scope (v1) / future

- **Estimation** — per-ticket PP-native estimates + estimate-vs-actual reports; optional
  rolled-up estimate per work-type task in Everhour. Nothing here precludes it.
- **Reporting surface** — sprint/work-type rollups, per-user breakdowns, charts. Defer until
  data accumulates.
- **Work-type editor UI** — lands with the in-progress org-settings surface.
- **Pull/import of Everhour-direct time** — time started in Everhour stays unattributed
  (accepted). `ticketId` is nullable so a future importer can land ticket-less entries
  without migration.

## Phasing

1. **Structure** — org config seed + per-sprint work-type task scaffolding; retire
   ticket=task. Pure structure, verifiable in Everhour.
2. **Capture** — per-user inline connect, timer start/stop (PP + webhook), manual Log time,
   attribution index, global indicator.
3. **Display** — per-ticket tracked time (user + total) with the info popover.
4. **Later** — reporting surface, estimation, work-type editor.

## Open implementation notes (decide during impl)

- **i18n**: new `time_` prefix in `messages/en/time.json`; update the CLAUDE.md i18n table +
  Inlang `pathPattern` in the same PR (per the architectural-decision rule).
- Reconciliation backstop cadence for missed webhooks (`/timers/current` poll points + a
  manual project sync).
- Everhour `userDate`/`date` are `Y-m-d` in the user's date — confirm timezone handling.
