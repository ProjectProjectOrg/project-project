# Figma package migration: official API research

Researched: **2026-10-23**. Target: extracting the existing integration into `@pp/integration-figma`.

Read `AGENTS.md`, `docs/PROJECTPROJECT.md`, and the relevant existing Figma services. External evidence is restricted to Figma's developer documentation and official REST API schema. No provider accounts, credentials, live API calls, tests, or source changes were used. “Verified” below means documented, not experimentally established.

## Verified API facts

### OAuth

- Authorization uses `GET https://www.figma.com/oauth` with `client_id`, registered `redirect_uri`, `scope`, random stored `state`, and `response_type=code`. Compare returned state with the stored value. Requested scopes can be a configured subset, separated by spaces or commas.
- **PKCE is supported:** optional, highly recommended, S256 only; send `code_challenge` during authorization and `code_verifier` during exchange. The documented exchange still authenticates the client with its secret.
- Codes expire after **30 seconds**. Exchange using `POST https://api.figma.com/v1/oauth/token`, HTTP Basic client credentials, and `application/x-www-form-urlencoded` body containing `redirect_uri`, `code`, `grant_type=authorization_code`, and verifier when applicable.
- Refresh uses `POST https://api.figma.com/v1/oauth/refresh`, Basic/form authentication, and body `refresh_token`. The response includes `access_token`/`expires_in`, without requiring a replacement refresh token.
- Access tokens default to 90 days; refresh tokens are reusable. Refresh invalidates the previous access token; Figma maintains one access token per app/user. API requests use `Authorization: Bearer <token>`.
- Embedded WebViews are unsupported; rejection produces no callback.

Source: [OAuth apps](https://developers.figma.com/docs/rest-api/oauth-apps/).

**Documented inconsistency:** the [May 16, 2025 changelog entry](https://developers.figma.com/docs/rest-api/changelog/#may-16-2025) recommends refreshing through `/v1/oauth/token`, while retaining `/v1/oauth/refresh` support. The current guide above and [official OpenAPI security scheme](https://github.com/figma/rest-api-spec/blob/main/openapi/openapi.yaml) specify `/v1/oauth/refresh`. This research does not establish an alternative refresh request contract. The [April 15, 2025 entry](https://developers.figma.com/docs/rest-api/changelog/#april-15-2025) also confirms `user_id_string` replaces deprecated numeric `user_id`; do not round provider IDs through JavaScript numbers.

### Credentials, scopes, and access

- PATs act as their creator and use `X-Figma-Token`, with configured scopes and expiry; revocation is immediate. [PAT documentation](https://developers.figma.com/docs/rest-api/personal-access-tokens/).
- New PATs have a maximum lifetime of 90 days; non-expiring PATs can no longer be created. This is a PAT policy, separate from OAuth refresh. [April 28, 2025 changelog](https://developers.figma.com/docs/rest-api/changelog/#april-28-2025).
- The existing scope set maps to identity (`current_user:read`), file/node/render content (`file_content:read`), metadata (`file_metadata:read`), and Dev Resources lookup/write (`file_dev_resources:read`, `file_dev_resources:write`). Scopes never override underlying organization/file permissions. Deprecated `files:read` should not replace the granular set. [Scopes](https://developers.figma.com/docs/rest-api/scopes/).
- `GET /v1/me` returns the authenticated identity and requires `current_user:read`. [User endpoint](https://developers.figma.com/docs/rest-api/users-endpoints/).
- App ownership, configured scopes, and publication are operational prerequisites: public apps require review; internal apps do not. Existing apps had to republish by November 17, 2025 or fall into draft and lose REST API access. Deployment status was not inspected. [Developer platform changes](https://developers.figma.com/docs/updates-to-figmas-developer-platform/).

### Files, nodes, and images

- `GET /v1/files/:key` returns content plus metadata such as `name`, `lastModified`, and `thumbnailUrl`; `depth=1` limits traversal to pages. This remains a **Tier 1** content request.
- `GET /v1/files/:key/nodes?ids=...` is also Tier 1. Node-map entries can be null. File, node, and render endpoints support branch keys.
- `GET /v1/files/:key/meta` is **Tier 3**, requires `file_metadata:read`, and returns a nested `file` with differently named fields, including `last_touched_at` and `thumbnail_url`.
- `GET /v1/images/:key?ids=...` renders nodes, requires content scope, and is Tier 1. Render URLs expire after **30 days**. Null image values represent render failures. Scale range is **0.01–4**; exports above 32 megapixels are scaled down. Multiple IDs can share a request.
- `GET /v1/files/:key/images` retrieves image fills, a separate Tier 2 operation; its URLs expire within **14 days**. Neither lifespan establishes a `thumbnailUrl` lifetime.

Source: [File endpoints](https://developers.figma.com/docs/rest-api/file-endpoints/). No durable validity guarantee for file thumbnail URLs was found.

### Dev Resources

- `POST /v1/dev_resources` bulk-creates resources. Successful items appear in `links_created`; **HTTP 200 can contain failures in `errors`**. Documented failures include an unknown file, a node already holding 10 resources, or another resource on that node with the same URL.
- `GET /v1/files/:file_key/dev_resources?node_ids=...` supports filtered recovery and requires read scope. Creation and `DELETE /v1/files/:file_key/dev_resources/:dev_resource_id` require write scope. These are Tier 2 operations. DELETE returns no body; 404 means the resource/file was not found.
- No idempotency-key parameter or exactly-once creation guarantee is documented. Duplicate-URL rejection is not a successful upsert returning the existing ID.

Source: [Dev Resources endpoints](https://developers.figma.com/docs/rest-api/dev-resources-endpoints/).

Creation requires `name`, `url`, `file_key`, and `node_id`; creation targets a **main file**, not a branch. [Dev Resource types](https://developers.figma.com/docs/rest-api/dev-resources-types/). The [official schema](https://github.com/figma/rest-api-spec/blob/main/openapi/openapi.yaml) also requires main-file keys for deletion, accepts PAT and OAuth authentication for these operations, and lists 403 responses. Together with the scope rules above, this establishes both token and underlying permission checks; it does not establish a precise viewer/editor/creator authorization matrix.

### Rate limits

Budgets depend on endpoint tier, requesting user's seat, and the resource's plan. OAuth budgets are per user/plan/app; PAT budgets are per user/plan, so sharing a PAT shares its budget.

The published table gives View/Collab seats up to **20 Tier 1 requests/month**, **5 Tier 2/minute**, and **10 Tier 3/minute**, with potentially lower actual allowances. Paid Professional/Organization/Enterprise Dev/Full rates are respectively **10/15/20 per minute** for Tier 1, **25/50/100** for Tier 2, and **50/100/150** for Tier 3. These are current documentation values, not promised capacity.

On 429, `Retry-After` is an integer number of seconds. Additional headers identify plan tier, rate-limit type, and upgrade URL. Figma may change limits. The same page contains a Starter example mentioning six requests/month, so avoid deriving a fixed Starter allowance from that example. [Rate limits](https://developers.figma.com/docs/rest-api/rate-limits/).

## Migration-required preservation: local code evidence

These are existing PP behavior, not additional Figma guarantees:

- [FigmaIntegrationsLive.ts](../packages/server-core/src/figma/FigmaIntegrationsLive.ts): preserve the callback path, scope set, Basic/form exchanges, refresh-token fallback, returned expiry handling, encrypted token persistence, and identity verification. `startOauthFlow` stores a hash of 32 random bytes with a ten-minute expiry. `consumeOauthStateQuery` atomically checks PP user ID, hash, expiry, and unconsumed status before marking consumption. Preserve this user binding; provider state echo alone does not bind a PP session. PKCE is currently absent.
- The same service refreshes expired personal OAuth credentials before persisting and returning the replacement, distinguishes rejected grants from transient failures, and keeps project PAT resolution available without OAuth configuration. Do not collapse personal and project credential selection during extraction.
- [FigmaLive.ts](../packages/server-core/src/figma/FigmaLive.ts): preserve PAT/bearer headers, decoding, null-node/render handling, scale clamping, byte downloads, typed failures, and `Retry-After` parsing. Preserve inspection of creation errors, duplicate recovery by URL lookup, and DELETE 404 success. Recovery currently suppresses lookup failures and can return null; that is best-effort behavior, not proof that no resource exists.
- [FigmaLinksLive.ts](../packages/server-core/src/figma/FigmaLinksLive.ts): background resolution/backlinks pass no user ID and therefore use the project credential. Keep org-storage thumbnail uploads, nonfatal thumbnail/backlink failures, stored Dev Resource IDs, cleanup when a local reference disappears during creation, and retained references after failed deletion. Thumbnails are copied bytes, so provider URL expiry does not expire those stored objects.

## Possible follow-ups and open questions

- **PKCE:** adding verifier persistence is a separate change. The guide leaves a separate `code_challenge_method` parameter unspecified; confirm its wire contract. Do not assume public-client support.
- **Refresh concurrency:** one active access token per app/user implies competing refreshes can invalidate a token another request just persisted. Review coordination independently of moving files. Resolve the contradictory refresh-endpoint guidance before changing endpoints.
- **Cheaper metadata:** `/meta` could reduce Tier 1 usage, but requires response adaptation and consideration of `last_touched_at` versus PP's `lastModified`. Preserve `/files?depth=1` during a behavior-preserving extraction; batching node/render IDs is another optional optimization.
- **Authorization:** the reviewed REST documentation/schema does not specify whether every Dev Resource write needs editor access, a Dev seat, or creator/app ownership, nor how cross-credential deletion behaves. Do not invent those guarantees or transfer plugin API rules to REST. PP permissions remain independent of Figma authorization.
- **Error classification:** `FigmaLive` currently maps both 401 and 403 to `FigmaAuthInvalid`; a scope/file-permission denial need not establish token expiry. Review separately before changing existing credential-health behavior.
- **Retry and retention:** lookup failures currently become null and creation recovery only follows a received API error; this is not general recovery from an uncertain network outcome. Durable retry scheduling, ownership of a recovered pre-existing URL, thumbnail refresh policy, and expiry-aware PAT UX remain follow-ups. No undocumented rate, lifetime, deletion, or idempotency guarantees should be introduced by the package boundary.
