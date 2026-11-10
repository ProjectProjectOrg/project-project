# Jira harness

A fake Jira Cloud site and fake Atlassian OAuth for running the Jira import locally, either through the browser wizard or headless. It lives in `apps/backend/src/jira/BrowserFixtures.ts` (transport, OAuth, fault injection) and `apps/backend/src/jira/generatedSite.ts` (the generated project). Nothing leaves the machine: the fixture replaces the Jira HTTP transport and token endpoint inside the backend process.

## Resources

The harness only runs against the isolated containers:

```sh
docker start projectproject-t172-local-postgres projectproject-t172-local-minio
```

Postgres listens on `127.0.0.1:55432` (database `projectproject_effect_v4_t172_browser`), MinIO on `127.0.0.1:59000` (bucket `projectproject-t172-local-browser`). Both scripts refuse any other database or bucket.

## Browser wizard

Backend on port 3000, from `apps/backend`:

```sh
PROJECTPROJECT_TEST_DATABASE_URL=postgres://projectproject:projectproject_dev@127.0.0.1:55432/projectproject_effect_v4_t172_browser \
JIRA_BROWSER_S3_ENDPOINT=http://127.0.0.1:59000 \
JIRA_BROWSER_BUCKET=projectproject-t172-local-browser \
bun scripts/jira-browser-harness.ts
```

Frontend on port 5174, from `apps/frontend`:

```sh
JIRA_BROWSER_API_TARGET=http://127.0.0.1:3000 bunx vite --host 127.0.0.1 --port 5174 --strictPort
```

Sign-in is by magic link; the link is printed as `[magic-link] … url=…` in the backend output. The workflow engine is a single SQL runner, so run only one harness process (browser or load) against the database at a time.

Control routes on the backend, under `/__jira-harness`: `POST /scenario` (`{"scenario": "happy_path" | "rate_limited_once" | "reconnect_once" | "pause_issue_page" | "pause_attachment"}`), `POST /release-attachment`, `POST /revoke` and `POST /restore` (Jira answers 401 and refresh fails with `invalid_grant` until restored or reconnected), `GET /calls` (the last 2,000 Jira and OAuth calls).

## The fixture site

The site holds two projects plus optional filler:

- `APP` (id `10000`): the original hand-written two-issue project. It is unchanged by any setting below.
- `GEN` (id `20000`): a generated project, 40 issues by default, built deterministically from a seed. Pages are generated on request, so memory does not grow with the issue count, and attachment bytes are streamed in 64 KiB chunks.
- `PRJ0` … `PRJn` (ids from `30000`): empty projects for exercising the project picker.

`GEN` contains: users with and without email, two users sharing the display name "Sam Taylor", deactivated users and an app user; statuses across all three categories; Story, Bug, Task, a renamed epic type "Initiative" (hierarchy level 1) and "Sub-task"; epics every 50 issues with about 70% of the following issues as children; a subtask every 10th issue; labels that collide after normalisation (`front-end`, `Front-End`, `front_end`, `FRONT.END`, …); components, fix and affects versions; restricted issues (every 97th), restricted comments and worklogs; Blocks and Relates links on both sides plus one cross-project link to `APP-1`; a scrum board with closed, active and future sprints, and a team-managed (`simple`) board with sprints; issues in both an active and a future sprint; the sprint (`customfield_10020`), rank, story-point and select custom fields; rich ADF descriptions on every 10th issue covering headings, all marks including text colour and underline, lists, code, blockquote, rule, panel, expand, nested expand in a table, task and decision lists, media single and group, mentions, dates, status lozenges, emoji and inline and block cards. Search pages carry the first 20 comments and worklogs with totals, as Jira does; child endpoints page at 100.

Attachments: issue `GEN-1` has a 0-byte attachment, sizes are skewed towards small files up to the configured maximum, and `JIRA_FIXTURE_LARGE_ATTACHMENTS` issues spread across the project get one 26 to 34 MiB zip each.

## Settings

All are environment variables read by both scripts.

| Variable | Default | Meaning |
| --- | --- | --- |
| `JIRA_FIXTURE_SEED` | 172 | Seed for every generated value and fault draw |
| `JIRA_FIXTURE_ISSUES` | 40 | Issues in `GEN` |
| `JIRA_FIXTURE_USERS` | 24 | Users referenced by `GEN` |
| `JIRA_FIXTURE_STATUSES` | 9 | Statuses (minimum 3) |
| `JIRA_FIXTURE_LABELS` | 24 | Distinct labels |
| `JIRA_FIXTURE_COMPONENTS` | 6 | Components |
| `JIRA_FIXTURE_VERSIONS` | 4 | Versions |
| `JIRA_FIXTURE_COMMENTS` | 2 | Mean comments per issue (exponential distribution) |
| `JIRA_FIXTURE_LONG_THREAD_EVERY` | 0 | Every Nth issue (offset 3) gets a long thread; 0 disables |
| `JIRA_FIXTURE_LONG_THREAD_LENGTH` | 150 | Comments in a long thread (max 999) |
| `JIRA_FIXTURE_CHANGELOGS` | 3 | Mean changelog entries per issue; every 300th issue has 250 |
| `JIRA_FIXTURE_WORKLOGS` | 1 | Mean worklogs per issue; every 400th issue has 120 |
| `JIRA_FIXTURE_ATTACHMENTS` | 0.5 | Mean attachments per issue |
| `JIRA_FIXTURE_ATTACHMENT_MAX_BYTES` | 2097152 | Largest ordinary attachment |
| `JIRA_FIXTURE_LARGE_ATTACHMENTS` | 0 | Attachments over 25 MiB |
| `JIRA_FIXTURE_EXTRA_PROJECTS` | 0 | Empty `PRJn` projects in the picker |
| `JIRA_FIXTURE_LATENCY_MS` | 0 | Added to every Jira response |
| `JIRA_FIXTURE_ROLLING_GRANT` | true | OAuth grants expire an hour after issue; false keeps the fixed past expiry the unit tests use |

Faults. Probabilities are per Jira call, drawn from the seed and the call count.

| Variable | Default | Meaning |
| --- | --- | --- |
| `JIRA_FIXTURE_P429` | 0 | 429 with `Retry-After: 2` |
| `JIRA_FIXTURE_P429_BARE` | 0 | 429 without `Retry-After` |
| `JIRA_FIXTURE_P5XX` | 0 | Half 503 with `Retry-After: 3`, half 500 without |
| `JIRA_FIXTURE_PSLOW` | 0 | Response delayed by `JIRA_FIXTURE_SLOW_MS` (default 25000, beyond the 20 s header timeout) |
| `JIRA_FIXTURE_PDROP` | 0 | Connection drop: a network error, or for attachments a stream that fails halfway |
| `JIRA_FIXTURE_MALFORMED_COMMENT` | false | The first comment on `GEN-3` has no author |
| `JIRA_FIXTURE_UNKNOWN_STATUS` | false | `GEN-2` is in a status missing from the project's status list |
| `JIRA_FIXTURE_MISSING_ATTACHMENT` | false | The first attachment on the first issue after `GEN-1` with attachments returns 404 on download |
| `JIRA_FIXTURE_SIZE_MISMATCH` | false | The first attachment on the next such issue streams 17 bytes more than its metadata says |
| `JIRA_FIXTURE_REVOKE_AFTER` | 0 | After this many Jira calls, access is revoked (401, refresh `invalid_grant`) until reconnect |

## Headless load run

`apps/backend/scripts/jira-load-harness.ts` drives one migration of `GEN` end to end through the backend services (create, scan, configure with the wizard's defaults, run, publish) and prints the time per phase, every status and phase change with RSS and heap, peak RSS and heap, scan counts, the failure if any (with the preparation reasons when preparation was rejected) and Jira calls per operation. From `apps/backend`, with the same three resource variables as the browser harness and any settings above:

```sh
PROJECTPROJECT_TEST_DATABASE_URL=postgres://projectproject:projectproject_dev@127.0.0.1:55432/projectproject_effect_v4_t172_browser \
JIRA_BROWSER_S3_ENDPOINT=http://127.0.0.1:59000 \
JIRA_BROWSER_BUCKET=projectproject-t172-local-browser \
JIRA_FIXTURE_ISSUES=2000 JIRA_FIXTURE_USERS=300 JIRA_FIXTURE_STATUSES=40 JIRA_FIXTURE_LABELS=200 \
bun scripts/jira-load-harness.ts
```

It imports as an owner of org `JIRA_LOAD_ORG` (default `jira-harness-4`) who has an active Jira connection; connect one through the browser harness first if the database is new. `JIRA_LOAD_SPRINT_CHOICE` is `none` (default: issues in both an active and a future sprint join neither) or `first` (the wizard's first option). `JIRA_LOAD_TIMEOUT_MINUTES` (default 240) bounds the import phase.
