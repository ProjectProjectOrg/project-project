# Figma package conversion — architecture proposal

Date: 2026-10-23. Status: proposed, for architecture review before implementation.

## Recommendation

Move Figma requests, connections, credentials, reference reconciliation, metadata caching and Dev Mode backlinks into `@pp/integration-figma`. The backend supplies PP capabilities through `FigmaHost`. Core retains ticket writes and a one-operation Figma reconciliation port. Keep the current best-effort execution model for this conversion; evaluate durable delivery separately.

This follows the dependency direction established by Slack, GitHub and Everhour. It does not introduce a provider-core package, a universal integration driver, a new HTTP contract or a new storage abstraction.

## Evidence and baseline

The inspected worktree is at `1a9cb3082e861a4645c434c55fa3e81fb5ad9b0e`. Figma production files and transport routes have no diff against merged main `2b5481ae34e43e172e2c7a392e7247a5c6c8c148`. GitHub and Everhour precedents were also inspected in that merged tree. This proposal changes no application code and does not claim runtime validation.

| Current owner | Behavior and dependencies |
| --- | --- |
| [FigmaLive](../../../packages/server-core/src/figma/FigmaLive.ts) | Six outbound operations: identity, file metadata, node name, rendered bytes, resource creation and resource deletion. HTTP status normalization and wire decoding live here. |
| [FigmaIntegrationsLive](../../../packages/server-core/src/figma/FigmaIntegrationsLive.ts) | Personal OAuth, guarded state consumption, token encryption and refresh, project PAT connections and broken-credential status. Imports `SecretCrypto`, `OrgStorage` and `TicketIndex`. |
| [FigmaLinksLive](../../../packages/server-core/src/figma/FigmaLinksLive.ts) | Parses ticket references, updates derived rows, refreshes metadata, renders/uploads thumbnails, creates/retracts backlinks and authorizes thumbnail reads. Imports `Access`, project lookup, `OrgStorage` and `S3Storage`. |
| [TicketsLive](../../../packages/server-core/src/tickets/TicketsLive.ts) and [TicketDocsLive](../../../packages/server-core/src/tickets/TicketDocsLive.ts) | Four reconciliation call sites cover creation, body update, split cleanup and deletion. Calls run from persistence callbacks under the ticket mutation lock. |
| [Backend HTTP handlers](../../../apps/backend/src/handlers/figma.ts), [OAuth routes](../../../apps/backend/src/http/figmaOauthRoutes.ts) and [thumbnail route](../../../apps/backend/src/http/figmaThumbnailRoutes.ts) | Sessions, typed project middleware, redirects and HTTP error translation. |
| [Shared Figma helpers](../../../packages/shared/src/figma.ts), [schemas](../../../packages/shared/src/schemas/Figma.ts), [HTTP definitions](../../../packages/shared/src/api.ts) and [DB schema](../../../packages/db/src/schema.ts) | Existing cross-process contracts, pure URL parsing and persistence declarations. |

The original [T-51 design](2026-09-04-figma-integration-design.md) explains the product intent. Where older prose and current implementation differ, preserve the implementation during extraction and record any desired behavior change separately. Current metadata rows are scoped by project, file and node; they are not one organization-wide cache.

## Alternatives

| Option | Benefit | Cost | Decision |
| --- | --- | --- | --- |
| Extract only the REST client | Small first change; isolates provider HTTP code | Most provider behavior remains coupled to core; does not complete the ownership split | Useful first layer, insufficient final state |
| Extract the complete provider module with a host and narrow core port | Concentrates provider behavior and tests; core owns write ordering; no package cycle | Requires a concrete backend host for secrets, storage, permissions and URLs | Recommended |
| Move all execution to durable outbox delivery at the same time | Survives process restarts and supports scheduled retries | Changes persistence, acknowledgement, deletion recovery and scheduling while moving owners | Separate proposal after extraction |

## Ownership

| Owner | Responsibilities |
| --- | --- |
| `integration-figma` | Figma REST and OAuth requests, response decoding, existing error normalization, OAuth state/credential lifecycle and provider-specific SQL, project connection records, reference delta calculation, metadata freshness policy, thumbnail rendering, backlink lifecycle and provider-facing naming |
| `server-core` | Ticket authorization and document locks, markdown writes, attachment/index ordering, when reconciliation is invoked, and the small `FigmaLinks` port used by ticket writes |
| Backend | Sessions and HTTP routes, PP authorization and published-project lookup, secret encryption implementation, org storage connection/prefix and upload/signing mechanics, application callback/ticket URLs, host implementation and layer composition |
| `shared` | Existing endpoints, error tags, response schemas, `ProjectScope`/`CurrentUser`, URL parser and embed helpers used across client/server |
| `db` | All existing tables, relations, constraints and migrations |
| Frontend | Existing editor, embeds, settings and atoms; no conversion changes needed |

Package code may depend on `@pp/db`, `@pp/shared`, Effect, Drizzle and existing utility dependencies. It must not import `@pp/server-core` or either app. Core must not import any integration package. Existing lint patterns already express both restrictions; retain their coverage for the new package.

## Interfaces and composition

The final package has three caller-facing capabilities: connection operations, ticket-link operations and its PP host requirements. Its REST client is an internal seam for provider transport and owning tests; core has no need for a second six-operation Figma client port.

Suggested layout, following the existing integration package conventions:

```text
packages/integration-figma/
  src/Client.ts          Figma HTTP operations and normalized provider facts
  src/Integrations.ts    OAuth, credentials and project connections
  src/Links.ts           references, cache and backlink processing
  src/Host.ts            required PP capabilities
  src/Services.ts        package layer composition
  test/                  provider-owned behavior and persistence tests

apps/backend/src/figma/
  HostLive.ts            actual PP capabilities
  FigmaLive.ts           package composition plus core-port adapter
  FigmaHost.postgres.test.ts

packages/server-core/src/figma/FigmaLinks.ts
                         core tag and reconcileTicket contract only
```

Keep the current `FigmaLinks.reconcileTicket(orgSlug, slug, ticketId, title, body)` contract in core. It returns `Effect<void>` and does not acquire a Figma error channel. Move `listForTicket`, thumbnail resolution and all Figma helper implementations into the package because their production callers are backend routes. Remove the unused core REST and connection tags once their callers have moved. Do not retain compatibility aliases without production consumers.

The backend adapter provides the core tag using the package implementation's `reconcileTicket` operation. Core retains all four invocation sites. Package HTTP handlers and routes use package capabilities directly. Package code never calls `Tickets` or `TicketsLive`: the ticket writer supplies the already-persisted title/body, avoiding a composition cycle and a second ticket read.

Shared Figma shapes need no new provider-client facts for this design. Normalize REST facts privately inside the package. Keep the browser-safe URL parser in shared because the editor and reconciler both consume it; do not add a browser client subpath or migrate unrelated browser helpers as part of this conversion.

### Proposed FigmaHost capabilities

These describe real variations in the current implementation, rather than exposing whole core modules. Names are provisional; behavior and error contracts are the design decisions.

| Capability | Input/output and contract |
| --- | --- |
| `project` | Org/project slugs → published project and organization IDs, or existing `NotFound`. Use the existing publication predicate. Both reconciliation and credential lookup need this. |
| `seal`, `open` | Plaintext ↔ the existing ciphertext/nonce/tag shape. Backend maps crypto failures to existing `FigmaError` reason `figma_secret_storage_unavailable`. The package owns credential rows. |
| `requireThumbnailStorage` | Org slug → success or existing storage availability/config errors. Status turns these into `storageConnected: false`; project connect maps them to existing `StorageNotConnected`, as today. |
| `storeThumbnail` | Org slug, package-relative object key and bytes → persisted full object key. Backend applies the org connection's prefix and retains the current presigned PUT/upload behavior. No bucket, credentials or `S3Connection` crosses the seam. |
| `thumbnailUrl` | Org slug and the stored full object key → signed inline image URL, retaining existing storage error mapping and one-hour view TTL. Only called after the authorization capability succeeds. |
| `requireThumbnailRead` | Org slug, the link row's organization ID and candidate referencing project IDs → authorized success or `NotFound`/`Forbidden`, requiring `CurrentUser`. Backend verifies the org ID matches the route slug, restricts projects to that organization, filters unpublished projects, then checks actual `figma:read` access to at least one referencing project. Empty eligible candidates must fail. |
| `ticketUrl` | Org/project/ticket identity → current absolute PP ticket URL. The backend owns the route and public origin. |
| `oauthRedirectUri` | Lazily resolved current backend callback URL. The backend owns this route and public origin; the package owns Figma's authorization URL and requested scopes. |

The package reads Figma link/reference rows to obtain the link's organization ID and candidate project IDs. The host owns publication and membership policy. This keeps Figma table queries out of the host while preventing the package from choosing PP roles or granting access. Checking both the link's organization ID and candidate project ownership also preserves tenant isolation if reference data is inconsistent. An org mismatch or unpublished-only candidate set must never reach signing.

The package generates the same relative Figma object path as today; the host adds the connection's normalized key prefix. Existing full keys stay in the database, so already-cached thumbnails remain readable without re-uploading. Check storage availability before rendering, as today. Keep the 300-second upload URL expiry, PNG labeling, rendering scale and path normalization unchanged during conversion.

This is intentionally a Figma-specific host. Reuse the actual crypto, access and storage implementations in its backend adapter, without extracting a new shared host framework.

## Behavior that must survive

### Authentication and connections

- Personal connections use OAuth bearer tokens; project connections use `X-Figma-Token` PATs. Background reference/cache/backlink work always selects the project credential, with no user fallback.
- Keep personal profile connection endpoints, even though there are no current per-user content reads. Do not silently remove a user-facing feature or make it populate shared previews.
- PAT-only deployments work without OAuth environment configuration. Resolve OAuth configuration only when starting/completing OAuth or refreshing an expired personal grant.
- Preserve hashed random state, user binding, the ten-minute TTL and the single guarded update that consumes an unexpired, unused state before code exchange. Do not replace it with a read-then-write claim.
- Preserve stored token encryption, five-minute refresh skew, refreshed-grant persistence before use, and the current distinction between rejected grants and transient refresh failures. A rejected personal grant does not silently select the project PAT.
- Keep the existing project connection transaction, organization/project integration relationship and broken-credential updates. Do not expand HTTP error tags.

### Ticket writes and processing

- Markdown is canonical. References, metadata and thumbnails remain derived. Reconciliation receives the persisted ticket snapshot, with empty title/body on deletion/cleanup.
- Keep callback ordering relative to attachment reconciliation and ticket-index updates. The synchronous reference work stays in the existing callback; external metadata/backlink work remains detached and best-effort. Provider or reference-processing failures must not turn a ticket save into a Figma error.
- Preserve actual triggers: creation, body changes and deletion/cleanup. Title-only edits currently do not invoke Figma reconciliation; changing backlink rename behavior is separate scope.
- Preserve the project/file/node uniqueness rules, including file-level null node IDs. Retain concurrency two, 24-hour successful metadata freshness, retry-on-next-reconciliation after errors and fallback labels before metadata exists.
- Preserve resource ID recovery after item-level create errors by matching the existing resource's URL. An unmatched resource or full node is a skipped creation, not proof that the desired backlink exists. Keep HTTP-level failure handling distinct.
- Do not delete a reference carrying a backlink until remote deletion succeeds. Retain it on failure for a later reconciliation. If a create finishes after its reference disappeared, retract the resource rather than leaving an untracked backlink.

### Thumbnail and HTTP behavior

- Metadata must not be filled using personal credentials and then shown to everyone in a project. Keep the per-project cache partition.
- Require a live referencing published project and current viewer permission before issuing a signed thumbnail URL. Keep the existing 302 redirect with `private, no-store`, 401 session handling, hidden 404 denial, and storage 503/502/500 mappings.
- Preserve OAuth start/callback paths, session requirements and profile redirect query parameters. Better Auth remains backend-owned.
- Keep all existing typed HTTP endpoints and shared error tags. No UI or browser import change is required by this design.

## Provider research and existing limitations

The companion [research note](../../figma-package-research.md) records current official Figma contracts. The architecture should isolate those contracts in the package and avoid turning assumptions from older design prose into new guarantees.

The extraction is also an opportunity to make existing limitations visible:

1. Detached work has no durable restart guarantee or independent periodic retry. Retained reference rows provide retry state only when another reconciliation happens. A durable outbox design must define deleted-ticket tombstones, subscriptions, provider cleanup and scheduling before replacing this model.
2. The client normalizes 429 and reads `Retry-After`, but reconciliation records an error and a later save can retry immediately. Figma's rate limits depend on credential identity, resource plan and endpoint tier. Cooldowns and batching are worthwhile follow-up work, not capabilities the current code already provides. ([Official rate limits](https://developers.figma.com/docs/rest-api/rate-limits/))
3. `getFile` currently uses the file-content endpoint, including for names. A metadata-only endpoint and grouping nodes per file could reduce requests, but change request behavior and deserve focused validation.
4. Figma supports optional S256 PKCE, while the current PP flow has no verifier storage. Its current OAuth guide documents `/v1/oauth/refresh`, while the changelog recommends `/v1/oauth/token` and retains the former. Preserve the working refresh path; evaluate PKCE, refresh serialization and newer token types independently. Do not claim refresh coordination already exists. ([OAuth guide](https://developers.figma.com/docs/rest-api/oauth-apps/), [May 16, 2025 changelog](https://developers.figma.com/docs/rest-api/changelog/#may-16-2025))
5. The original design treats node capacity as a successful no-op; the client actually returns no resource ID unless a matching existing URL can be recovered. Preserve and describe that observable distinction. ([Official Dev Resources endpoints](https://developers.figma.com/docs/rest-api/dev-resources-endpoints/))

## Migration sequence

Use three independently valid, reviewable layers after the architecture is accepted. Start from latest main, which contains both merged integration stacks.

1. **Requests/client.** Add the workspace package and move Figma REST requests, wire schemas, normalized types and transport tests. Temporarily adapt the existing core Figma client tag in the backend so existing core implementations continue to run. Include manifest, lockfile, TypeScript/test configuration and Docker manifest/node_modules/runtime copy changes in this layer. No new SDK dependency is needed.
2. **Connections and credentials.** Move OAuth/token logic, provider connection records and associated tests. Add host crypto, storage-availability, project lookup and callback URL capabilities. Backend handlers/OAuth routes use the package connection tag. Update composition while core links temporarily consumes a backend-supplied adapter for the connection operations it still needs. Keep that temporary adapter small and remove it in layer three.
3. **References, thumbnails and backlinks.** Move the links implementation and its provider tests. Complete the storage/access/URL host implementation, narrow the core port to reconciliation only and remove the temporary core client/connection adapters. Keep ticket persistence callbacks where they are. Add full backend host composition coverage and update the existing project-visibility suite.

No phase needs a schema migration just to move owners. Existing `db` declarations and encrypted rows remain valid. Any discovered correctness repair that changes behavior should be explicit in the layer description or separated from the extraction.

## Validation and test ownership

Provider request/auth decoding, reference planning, freshness and remote lifecycle behavior belong to package tests. Core ticket tests prove reconciliation receives the correct persisted body and still occurs in the same persistence ordering. Shared parser tests stay in shared. Backend tests own real PP capability composition and transport behavior.

Existing Figma persistence tests often use SQL-result proxies and exact SQL text. These are not evidence of actual transaction isolation or permission composition. Move useful behavior coverage with its owner, and use real isolated Postgres for state claims/reference retention where the guarantee depends on the database. Replace redundant SQL-shape assertions only after equivalent behavior is proven; do not add test-only production exports to preserve old helpers.

The backend composition proof must use real access, crypto, project visibility and storage adaptation with package capabilities, rather than a fake host that already implements the behavior being asserted. Stub the external Figma transport and object-storage HTTP side effects. Distinct cases should cover project-only shared cache population, OAuth state replay/user binding, denied/unpublished thumbnail signing, legacy stored object keys, failed backlink deletion retention and late-create compensation. Preserve existing stronger tests rather than replaying every case at every layer.

During implementation, run focused owner tests and workspace checks, then the full CI-runtime suite. Include the new package in `test:db` if it owns DB suites. Removing the Figma files from server-core's isolation split requires the full core suite with two file-order shuffle seeds. Keep moved global-mocking tests isolated. If shared/DB worker behavior changes, run the required two shuffle seeds there too. Verify both Docker images with frozen installs and a packaged backend import. Use isolated test databases only.

## Review decision

Approve or revise the complete-provider-module option, the one-operation core port and the proposed PP host responsibilities. The recommendation is to preserve today's execution semantics through the conversion, then discuss durable retries and request-budget improvements as a separate design. This document authorizes no migration, deployment, live provider calls or data changes by itself.
