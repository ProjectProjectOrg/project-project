# Jira package extraction: provider constraints

Researched: **2026-10-23**. Scope: official Jira Cloud developer documentation and published OpenAPI schema, plus read-only inspection of the current PP implementation. No authenticated requests, account access, implementation changes, or new architecture decisions.

This supplements [the earlier migration research](jira-cloud-migration-research.md). It identifies constraints an extraction into `@pp/integration-jira` must preserve; the parent owns the separate design document at `docs/superpowers/specs/2026-10-23-jira-package-design.md`.

## Verified provider facts

### OAuth, refresh and site access

- Jira 3LO documents authorization-code exchange with a client secret, registered redirect URI and user-bound `state`. `offline_access` enables refresh. Refresh rotates credentials; replace the stored pair. Defaults: **90-day inactivity expiry**, **10-minute reuse grace** to accommodate concurrency. `invalid_grant` can indicate expiry, password change or obsolete refresh-token use. [Jira 3LO guide](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/#use-a-refresh-token-to-get-another-access-token-and-refresh-token-pair)
- Discover current sites and their scopes through `GET https://api.atlassian.com/oauth/token/accessible-resources`; use returned `id` as `cloudid` in `https://api.atlassian.com/ex/jira/{cloudid}/…`. Both account-level and site-restricted grants are documented. Granted scopes never override the acting user's permissions. [Jira 3LO: resource access](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/#check-site-access-for-the-app)

Recovery implication: the grace period permits retries; it does not coordinate local credential writes or guarantee recovery after arbitrary downtime. Credential replacement and concurrent refresh behavior must survive extraction together.

### Issue search and API transitions

- Legacy GET/POST `/rest/api/3/search` are marked deprecated and **currently being removed**. Use enhanced `/rest/api/3/search/jql`; do not infer that every tenant still serves legacy search. Enhanced search requires bounded JQL, defaults to IDs only, accepts explicit fields, and can return fewer items than requested. `/search/approximate-count` is an estimate subject to search lag, not an export completeness check. [Issue search reference](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)
- `SearchAndReconcileResults.nextPageToken` documents **seven-day expiry**. The request reference says the final response omits it; the result schema also describes null on the final page. The result includes `isLast`, not an exact `total`. Current schema additionally documents experimental `warnings` for situations including truncated results; their availability/shape is not stable. [Published platform OpenAPI, `SearchAndReconcileResults` and `/search/jql`](https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json)
- Search is eventually consistent; updates can take seconds or minutes to appear. `reconcileIssues` strengthens consistency only for the specified, known issue IDs, with at most **50** IDs. It is not a whole-project snapshot facility. [Search and Reconcile guide](https://developer.atlassian.com/cloud/jira/platform/search-and-reconcile/)
- Page-size limits differ by operation and may change without notice. Offset totals can change between requests; a requested page can be empty. `total` and `isLast` are not universal response fields. [REST pagination contract](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/#pagination)

Recovery implication: continuation tokens are expiring provider state, not permanent recovery identifiers. Preserve the request context and captured records alongside progress. A short page alone does not establish completion. Request ordering does not establish source immutability.

### Child collections and sprint capture

| Collection | Current extraction contract | Recovery/completeness constraint |
| --- | --- | --- |
| Comments | `GET /rest/api/3/issue/{idOrKey}/comment`: `startAt`, `maxResults`; response has `comments`, offset metadata and `total`. Supports created-time ordering and optional rendered HTML. | Only comments visible under project, issue-security and comment role/group restrictions are returned. An empty success does not prove absence of hidden comments. [Comments](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/#api-rest-api-3-issue-issueidorkey-comment-get) |
| Changelog | Dedicated per-issue `/changelog` uses offset pagination, oldest first. Bulk `/rest/api/3/changelog/bulkfetch` uses a continuation token, up to 1,000 issues and optional filtering by up to ten field IDs. | Expanded search changelog describes recent updates; it does not replace paging the dedicated collection. Bulk retrieval is an available provider primitive, not a requirement to change PP's current strategy. [Issues reference](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-changelog-get), [OpenAPI operations and `BulkChangelogRequestBean`](https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json) |
| Worklogs | Per-issue `/worklog`: `startAt`, `maxResults`, oldest-created first; optional started-time bounds and properties expansion. Time tracking must be enabled. | Project, issue and worklog visibility apply. This operation documents `404` for missing/inaccessible issues **and disabled time tracking**; it cannot be interpreted simply as deletion. [Worklogs](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklogs/#api-rest-api-3-issue-issueidorkey-worklog-get) |
| Worklog change feeds | `/worklog/updated` and `/worklog/deleted` page IDs/timestamps via `nextPage`, `until`, `lastPage`; up to 1,000 per page. `/worklog/list` retrieves up to 1,000 IDs. | The feeds exclude changes during the minute before the request. An immediate final pass cannot establish a gap-free current snapshot. Their availability does not make them necessary for package extraction. [Worklog feed reference](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklogs/#api-rest-api-3-worklog-updated-get) |
| Boards and sprint definitions | `/rest/agile/1.0/board` and `/board/{boardId}/sprint` retain offset pagination. Sprint listing accepts state filters and returns only visible sprints, ordered by state then backlog position. | Listing definitions and capturing issue membership are separate reads. Discovering a board does not establish completeness of its issues. [Board reference](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/) |
| Sprint membership | Board-scoped enhanced `/rest/software/1.0/board/{boardId}/sprint/{sprintId}/issue` uses `nextPageToken`. Its old `/rest/agile/1.0` counterpart is deprecated. Required scopes: `read:sprint:jira-software`, `read:issue-details:jira`, `read:jql:jira`. | Only visible issues are returned; no board visibility produces no issues. Default ordering is rank; JQL ordering takes precedence. [Board sprint issues](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/#api-rest-software-1-0-board-boardid-sprint-sprintid-issue-get) |

The sprint-only API also has an enhanced `/rest/software/1.0/sprint/{sprintId}/issue` variant and a deprecated offset counterpart. These must not be conflated with board-scoped membership. [Sprint reference](https://developer.atlassian.com/cloud/jira/software/rest/api-group-sprint/)

### ADF fidelity and attachment/media identity

- REST v3 supports ADF in issue description/environment, comment bodies, worklog comments and multiline custom fields. [REST v3 formats](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/#version)
- ADF is an ordered JSON tree with nodes and marks, including panels, expands, mentions, statuses, media and formatting beyond ordinary Markdown. Atlassian cautions that schema membership alone does not establish support in a particular product implementation. **Inference:** Markdown output cannot be a lossless replacement for the original source tree. Raw ADF and conversion diagnostics retain distinct recovery value. [ADF structure and schema caveat](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/)
- ADF media `attrs.id` is a **Media Services ID**, accompanied by a collection; it is not documented here as a Jira attachment ID. The media page directs consumers to Media API metadata. **Inference:** joining media to attachment records merely by equal-looking IDs is not a verified provider contract. [ADF media node](https://developer.atlassian.com/cloud/jira/platform/apis/document/nodes/media/)
- Attachment metadata is separate from bytes. `/rest/api/3/attachment/content/{id}` supports `Range`, defaults to redirects, documents `303` with `Location`, and supports `redirect=false` for `200`/`206`. Issue/project permissions and private-comment restrictions apply. `404` can also mean attachments are disabled; `416` indicates an unsatisfied range. `/attachment/meta` exposes enabled state and configured upload limit. [Attachment reference](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-attachments/)

Recovery implication: attachment enumeration, byte capture and media-reference resolution are separate evidence. A metadata record or redirect URL is not proof that bytes were durably captured. The reviewed documentation does not promise permanent download URLs, a fixed redirect host set, or a universal URL lifetime.

### Rate limits, errors and retry semantics

- Current Jira Cloud guidance covers points-based hourly quotas, endpoint/tenant burst limits and per-issue write limits; 3LO apps are included. `429` is the throttle response. `Retry-After` supplies seconds; some transient `5xx`, including `503`, can also carry it. `RateLimit-Reason` distinguishes burst, global quota, tenant quota and per-issue writes. [Rate limiting and headers](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/)
- Atlassian recommends bounded exponential backoff with jitter and honoring `Retry-After` as a minimum. Scope matters: burst throttling concerns that endpoint/tenant; quota exhaustion can require pausing the wider quota scope. No fixed request-per-second number is assumed here. [Rate-limit handling](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/#best-practices-for-handling-rate-limit-responses)
- Error bodies may contain `errorMessages`, field-specific `errors`, and `status`; they are not guaranteed on every failure. Missing versus inaccessible resources are deliberately ambiguous on several read endpoints above. [REST status/error format](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/#status-codes)

Recovery implication: protocol failure classification and durable scheduling must retain the same meaning after extraction. Dropping delay/reason metadata can turn a recoverable pause into repeated failed work. A blanket “retry every POST” rule is unsafe: read-only search and token rotation have different effects.

### Export completeness and point-in-time claims

- Issue search filters by Browse Projects and issue-level security. Child collection visibility is additionally constrained as described above. This limits claims to content visible to the acting account. [Issue search permissions](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)
- App access rules can block content even when project metadata remains accessible. Atlassian explicitly documents Jira JQL search returning no results because of an app access rule. A successful empty response is therefore not a reliable policy preflight. [Data security policy developer guide](https://developer.atlassian.com/cloud/jira/platform/data-security-policy-developer-guide/)
- **Research conclusion, not an Atlassian guarantee:** no reviewed API provides a shared snapshot timestamp or transaction spanning issue search, comments, history, worklogs, sprints and attachment downloads. Eventual search consistency and mutable pagination totals provide positive reasons not to infer one. A PP manifest can durably freeze captured responses; it does not prove Jira was observed at one instant. [Search consistency](https://developer.atlassian.com/cloud/jira/platform/search-and-reconcile/), [Pagination](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/#pagination)

The earlier research's phrase “point-in-time Jira project” should be treated as product intent, not a verified REST guarantee. No site-backup or CSV claims from that note were revalidated here; those formats are outside this package-extraction investigation.

## Existing PP behavior observed locally

These are code observations, not claims that live Jira accepted the implementation.

- [OAuth.ts](../packages/server-core/src/jira/OAuth.ts#L78) sends an S256 challenge and verifier **and** client secret. [Credentials.ts](../packages/server-core/src/jira/Credentials.ts#L136) stores user-bound, expiring OAuth state. Its [refresh path](../packages/server-core/src/jira/Credentials.ts#L346) encrypts credentials and coordinates refresh through a database lease, with lease-conditioned writes. These concerns already cross protocol and persistence boundaries.
- [Client.ts search](../packages/server-core/src/jira/Client.ts#L617) uses enhanced POST search and cursor paging; [sprint issues](../packages/server-core/src/jira/Client.ts#L651) already use the enhanced `/rest/software/1.0` board-scoped endpoint. Search requests 100 items; offset reads also request 100 and honor response pagination. These numbers are PP choices, not guaranteed provider limits.
- [Site discovery](../packages/server-core/src/jira/Client.ts#L888) currently decodes site identity/display fields and discards returned per-resource scopes. It cannot establish site-specific scope sufficiency from that result alone.
- [Response classification](../packages/server-core/src/jira/Client.ts#L493) maps 403/404 separately, parses 429 delay and treats 5xx as transient. It currently drops `RateLimit-Reason` and 5xx `Retry-After`. The [authorization path](../packages/server-core/src/jira/Client.ts#L470) retries a 401 after forced refresh. These are existing semantics to audit, not provider guarantees.
- [Attachment streaming](../packages/server-core/src/jira/Client.ts#L744) follows bounded HTTPS redirects, strips authorization across origins and accepts 200/206. [ADF conversion](../packages/server-core/src/jira/Adf.ts#L64) returns warnings and references; [media handling](../packages/server-core/src/jira/Adf.ts#L254) places the media ID into a `jira-attachment` reference. The downstream ID resolution needs verification against the distinction above.
- [Page activities](../packages/server-core/src/jira/MigrationActivities.ts#L696) retain optional-source 403/404 warnings, write raw and normalized artifacts, and return the next cursor. [ScanV2.ts](../packages/server-core/src/jira/ScanV2.ts#L236) records visible-account caveats, category coverage, raw-artifact references, and schema/converter versions. Those durable artifacts carry source facts that the normalized PP shapes alone cannot recreate.

## Uncertainties

1. **PKCE enforcement:** the reviewed Jira 3LO guide does not document the challenge/verifier contract. PP sending them does not establish that Atlassian validates them. Obtain a current Jira-specific official contract; no live experiment was authorized. [Jira 3LO guide](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)
2. **Grant identity:** newer resource-level grant sections coexist with an older FAQ asserting one grant per app/account. Do not generalize that FAQ to every grant type without clarification. [Grant types and FAQ](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)
3. **Other cursor lifetimes:** token expiry for bulk changelog and enhanced Software APIs was not verified; do not copy the platform search lifetime to them.
4. **Media identity:** no mapping contract between ADF Media Services IDs and Jira attachment IDs was established from the reviewed docs.

## Follow-ups for the extraction review

1. **Interrupted refresh:** verify that the existing lease/persistence behavior retains the rotated pair across response loss, persistence failure and stale workers. Atlassian's grace is bounded; it supplies no local exactly-once guarantee.
2. **Expired cursors:** verify that a scan resumed beyond the documented search-token lifetime has a defined restart/revision outcome rather than treating the expired token as permanent progress.
3. **Coverage and drift:** verify preservation of provider warnings, category failure reasons, archived-project policy, and the distinction between an immutable PP capture and a transactional Jira snapshot. Current platform search exposes `includeArchivedProjects`, defaulting false. [Search request reference](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)
4. **Media recovery:** establish a documented or explicitly qualified media-ID/attachment-ID resolution path. Do not claim complete embedded-media migration from successful attachment downloads alone.

These follow-ups constrain a future extraction review. They do not authorize migration work, new endpoints, dependencies, or broader feature scope.
