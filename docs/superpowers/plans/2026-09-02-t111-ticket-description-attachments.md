# T-111 Ticket Description Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An org owner/admin connects one S3-compatible bucket, after which members can paste or drop images and files into a ticket description and have them upload, render inline, and be reaped when no longer referenced.

**Architecture:** Credentials live in the existing `organization_integration` table under a new `s3` provider with a sibling detail table, the secret encrypted with the AES-256-GCM helper lifted out of the Everhour layer into a shared `SecretCrypto` service. Upload is a three-step handshake — `prepare` mints a presigned `PUT`, the browser uploads straight to the bucket, `commit` verifies the object with `HeadObject` and flips the row live — so upload bytes never transit the droplet. The markdown stores only a plain CommonMark image whose URL is an app-relative `/api/attachments/:orgSlug/:id`; a raw router mount resolves the session, authorizes, and `302`s to a short-lived presigned `GET`, so nothing durable ever holds a credential or an expiring URL.

**Tech Stack:** Effect 3.21 (HttpApi, Layer, Schema), Drizzle + Postgres, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, Better Auth, TanStack Start + Router, `@effect-atom/atom-react`, Lexical 0.44, MinIO (local dev only), Vitest.

**Spec:** ProjectProject ticket **T-111** — "Ticket description attachments over a connected S3-compatible bucket". Read the ticket body before starting; it is the requirements document this plan implements. Umbrella ticket is T-15.

## Global Constraints

- **No comments in code.** Zero inline comments by default — see `AGENTS.md`. A single line is acceptable only where a value would actively mislead. Never write multi-line comment blocks or rationale prose; that belongs in the commit message. The existing heavily-commented files (`main.ts`, `db/schema.ts`, `api.ts`) are legacy from the learning phase — do not imitate them in new files.
- **Every user-facing string goes through paraglide** (`m.*` from `@/paraglide/messages`). Raw literals in JSX are forbidden. New keys use flat prefix-based IDs and land in the file that owns their prefix. This feature introduces the `storage_` prefix (org storage settings) and extends `editor_` (upload affordances) — both live in `packages/frontend/messages/en/projects.json`, per the table in `AGENTS.md`. Update the `AGENTS.md` i18n table in the same PR.
- **Buttons scale to 97% on `:active`** with a 100–150ms transform transition: `active:scale-[0.97] transition-transform duration-100`.
- **Hover states need a transition class** (`transition-colors` etc.) or the global instant-in/eased-out rule in `styles.css` has nothing to override.
- **Prefer a variant on an existing primitive** over one-off local Tailwind. If extending the primitive would disrupt other callsites, stop and ask.
- **Every mutation atom is family-keyed** by the resource it affects — `orgKey(orgSlug)` for org-scoped, `ticketKey(orgSlug, slug, id)` for ticket-scoped. Path fields come from the key, not the input.
- **Optimistic reads split base + wrapper.** Private `xBaseAtom` under `Atom.optimistic`, exported as `xAtom`. Mutations are `Atom.optimisticFn` and always `get.refresh` the **base** atom, never the wrapper.
- **Render atom Results with `Result.matchWithError`** handling all four variants; failures render `<ErrorPage error={...} contained />` inside settings panels.
- **Wire errors are `Schema.TaggedError`** with an `HttpApiSchema.annotations({ status })`. Internal-only errors that never cross the wire stay `Data.TaggedError`.
- **Content-type allowlist:** `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/avif`, `application/pdf`, `application/zip`, `application/gzip`, `application/x-tar`. `image/svg+xml` is deliberately excluded.
- **Size cap:** 25 MB per file (`25 * 1024 * 1024` bytes). No per-ticket count limit.
- **Attachment URL shape:** `/api/attachments/:orgSlug/:attachmentId` — decided; do not change it.
- **Attachment ids are ULIDs** (`ulid` is already a backend dependency), 26 chars, Crockford base32.
- **Secrets never leave the backend.** No endpoint returns a secret access key; the status endpoint returns a masked access key id only.
- **Scope discipline:** ticket descriptions only. Do not add attachment support to comments, project docs, group docs, avatars, or org logos. `LexicalEditor` is shared by six callsites — attachment support must be opt-in via a prop so the other five are untouched.

## Environment Notes

- Work in the worktree at `.claude/worktrees/T-111-attachments` on branch `feat/T-111-attachments` (cut from `origin/main` at `f507e76`).
- `.env` is gitignored and has already been copied into the worktree. Do not commit it.
- **`packages/frontend/src/paraglide/` is generated and gitignored.** It has already been generated here. If frontend tests fail with `Failed to resolve import "@/paraglide/messages"`, run `cd packages/frontend && bun run paraglide:compile`.
- Baseline before this plan: **469 tests passing, 4 skipped, 0 failures** across the three packages.
- Commands: `bun run test` (all packages), `bun run typecheck`, `bun run lint`, `bun run format`. Backend-only: `cd packages/backend && bun run test`.
- Migrations: `cd packages/backend && bun run db:generate` writes SQL into `src/db/migrations/`. Requires the postgres container (`bun run dev:db`).

## File Structure

**New — shared contract**
- `packages/shared/src/schemas/Attachment.ts` — attachment + storage wire schemas, allowlist, size cap.
- `packages/shared/src/attachments.ts` — pure URL build/parse/extract helpers. No Effect, no Schema.
- `packages/shared/src/attachments.test.ts` — tests for the above.

**New — backend**
- `packages/backend/src/Services/SecretCrypto.ts` — Tag + shape for AES-256-GCM secret sealing.
- `packages/backend/src/Layers/SecretCrypto.ts` — implementation, keyed off `USER_SECRET_ENCRYPTION_KEY`.
- `packages/backend/src/Layers/SecretCrypto.test.ts`
- `packages/backend/src/Services/S3Storage.ts` — Tag + shape wrapping the S3 API, plus the pure object-key builder.
- `packages/backend/src/Layers/S3Storage.ts` — `@aws-sdk/client-s3` implementation.
- `packages/backend/src/Layers/S3Storage.test.ts` — pure key-builder tests only, no network.
- `packages/backend/src/Services/OrgStorage.ts` — Tag + shape for connect/status/disconnect and per-org client resolution.
- `packages/backend/src/Layers/OrgStorage.ts`
- `packages/backend/src/Services/Attachments.ts` — Tag + shape for prepare/commit/resolve/reconcile, plus pure validation.
- `packages/backend/src/Layers/Attachments.ts`
- `packages/backend/src/Layers/Attachments.test.ts` — pure validation + reconciliation-planner tests.
- `packages/backend/src/handlers/storage.ts` — org storage HttpApi group.
- `packages/backend/src/handlers/attachments.ts` — ticket attachment HttpApi group.
- `packages/backend/src/http/attachmentRoutes.ts` — the raw `/api/attachments` redirect mount.
- `packages/backend/src/Layers/AttachmentReaper.ts` — scheduled orphan sweep.
- `packages/backend/src/Layers/AttachmentReaper.test.ts` — pure reap-planner tests.

**New — frontend**
- `packages/frontend/src/atoms/storage.ts` — org storage status + connect/disconnect atoms.
- `packages/frontend/src/atoms/attachments.ts` — upload orchestration atom family.
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/settings/storage.tsx` — the Storage settings tab.
- `packages/frontend/src/components/Lexical/AttachmentNode.tsx` — decorator node for images and file chips.
- `packages/frontend/src/components/Lexical/attachmentTransformer.ts` — markdown round-trip.
- `packages/frontend/src/components/Lexical/attachmentTransformer.test.ts`
- `packages/frontend/src/components/Lexical/AttachmentExtension.ts`
- `packages/frontend/src/components/Lexical/AttachmentsPlugin.tsx` — paste/drop/picker + upload lifecycle.

**Modified**
- `packages/shared/src/errors.ts` — seven new wire errors.
- `packages/shared/src/index.ts` — export the two new modules.
- `packages/shared/src/api.ts` — `StorageGroup`, `AttachmentsGroup`, both added to `AppApi`.
- `packages/backend/src/db/schema.ts` — `s3` provider, config union, `organizationS3Integration`, `attachmentIndex`.
- `packages/backend/src/db/migrations/` — one generated migration.
- `packages/backend/src/Layers/EverhourIntegrations.ts` — repointed at `SecretCrypto`.
- `packages/backend/src/runtime.ts` — new layers in `BackendServicesLive`.
- `packages/backend/src/main.ts` — handler layers + the raw attachment mount + reaper layer.
- `packages/backend/src/Layers/Tickets.ts` — attachment reconciliation in the description-save path.
- `packages/backend/package.json` — two AWS SDK dependencies.
- `packages/frontend/src/components/Markdown.tsx` — `img` override + attachment URL passthrough.
- `packages/frontend/src/components/LexicalEditor.tsx` — opt-in `attachments` prop.
- `packages/frontend/src/components/TicketPage/DescriptionField.tsx` — pass the prop.
- `packages/frontend/src/lib/errorMessage.ts` — new error tags.
- `packages/frontend/messages/en/projects.json` — `storage_` and `editor_` keys.
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/settings/route.tsx` — Storage rail entry.
- `docker-compose.yml` — MinIO service.
- `.env.example` — MinIO dev vars.
- `AGENTS.md` — i18n table gains the `storage_` prefix.

---

### Task 1: Shared attachment contract — schemas, errors, pure URL helpers

The whole feature keys off two things every other task imports: the allowlist/cap constants, and the URL helpers that turn an attachment id into markdown and back. Both are pure and fully testable with no infrastructure, so they land first.

**Files:**
- Create: `packages/shared/src/schemas/Attachment.ts`
- Create: `packages/shared/src/attachments.ts`
- Create: `packages/shared/src/attachments.test.ts`
- Modify: `packages/shared/src/errors.ts` (append at end of file)
- Modify: `packages/shared/src/index.ts` (add two export lines)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ATTACHMENT_MAX_BYTES: number` (26214400)
  - `ATTACHMENT_CONTENT_TYPES: readonly string[]`
  - `RASTER_IMAGE_CONTENT_TYPES: readonly string[]`
  - `isAllowedAttachmentContentType(value: string): boolean`
  - `isRasterImageContentType(value: string): boolean`
  - `ATTACHMENT_URL_PREFIX: "/api/attachments"`
  - `attachmentUrl(orgSlug: string, id: string): string`
  - `parseAttachmentUrl(url: string): { orgSlug: string; id: string } | null`
  - `extractAttachmentRefs(markdown: string): ReadonlyArray<{ orgSlug: string; id: string }>`
  - Schemas: `AttachmentId`, `Attachment`, `PrepareAttachmentInput`, `PrepareAttachmentResult`, `OrgStorageStatus`, `ConnectStorageInput`
  - Errors: `StorageNotConnected`, `StorageAuthInvalid`, `StorageConfigMissing`, `StorageError`, `AttachmentTooLarge`, `AttachmentTypeRejected`, `AttachmentNotUploaded`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/attachments.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  attachmentUrl,
  extractAttachmentRefs,
  parseAttachmentUrl
} from "./attachments"
import {
  isAllowedAttachmentContentType,
  isRasterImageContentType
} from "./schemas/Attachment"

const ID = "01JBX7Q2K9ZWCVE8MTQ4RXPGHN"

describe("attachmentUrl", () => {
  it("builds an app-relative url", () => {
    expect(attachmentUrl("acme", ID)).toBe(`/api/attachments/acme/${ID}`)
  })

  it("round-trips through parseAttachmentUrl", () => {
    expect(parseAttachmentUrl(attachmentUrl("acme", ID))).toEqual({
      orgSlug: "acme",
      id: ID
    })
  })
})

describe("parseAttachmentUrl", () => {
  it("rejects an absolute url", () => {
    expect(parseAttachmentUrl(`https://evil.test/api/attachments/acme/${ID}`))
      .toBeNull()
  })

  it("rejects a missing segment", () => {
    expect(parseAttachmentUrl(`/api/attachments/${ID}`)).toBeNull()
  })

  it("rejects a trailing segment", () => {
    expect(parseAttachmentUrl(`/api/attachments/acme/${ID}/raw`)).toBeNull()
  })

  it("rejects a non-ulid id", () => {
    expect(parseAttachmentUrl("/api/attachments/acme/not-a-ulid")).toBeNull()
  })

  it("rejects a path-traversal id", () => {
    expect(parseAttachmentUrl("/api/attachments/acme/..%2f..%2fetc")).toBeNull()
  })
})

describe("extractAttachmentRefs", () => {
  it("finds an image reference", () => {
    const md = `# Title\n\n![shot](/api/attachments/acme/${ID})\n`
    expect(extractAttachmentRefs(md)).toEqual([{ orgSlug: "acme", id: ID }])
  })

  it("finds a plain link reference", () => {
    const md = `[report.pdf](/api/attachments/acme/${ID})`
    expect(extractAttachmentRefs(md)).toEqual([{ orgSlug: "acme", id: ID }])
  })

  it("deduplicates a reference used twice", () => {
    const md = `![a](/api/attachments/acme/${ID}) and ![b](/api/attachments/acme/${ID})`
    expect(extractAttachmentRefs(md)).toEqual([{ orgSlug: "acme", id: ID }])
  })

  it("ignores mention links and external images", () => {
    const md =
      "[T-1](mention:ticket/T-1) ![x](https://example.test/a.png) ![y](/api/other/acme/x)"
    expect(extractAttachmentRefs(md)).toEqual([])
  })

  it("returns an empty array for markdown with no attachments", () => {
    expect(extractAttachmentRefs("just text")).toEqual([])
  })
})

describe("isAllowedAttachmentContentType", () => {
  it("allows png", () => {
    expect(isAllowedAttachmentContentType("image/png")).toBe(true)
  })

  it("allows pdf", () => {
    expect(isAllowedAttachmentContentType("application/pdf")).toBe(true)
  })

  it("rejects svg", () => {
    expect(isAllowedAttachmentContentType("image/svg+xml")).toBe(false)
  })

  it("rejects an executable", () => {
    expect(isAllowedAttachmentContentType("application/x-msdownload")).toBe(
      false
    )
  })

  it("normalizes case and parameters", () => {
    expect(isAllowedAttachmentContentType("IMAGE/PNG; charset=binary")).toBe(
      true
    )
  })
})

describe("isRasterImageContentType", () => {
  it("treats png as raster", () => {
    expect(isRasterImageContentType("image/png")).toBe(true)
  })

  it("does not treat pdf as raster", () => {
    expect(isRasterImageContentType("application/pdf")).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun run test attachments`
Expected: FAIL — `Cannot find module './attachments'`.

- [ ] **Step 3: Write the schema and constants module**

Create `packages/shared/src/schemas/Attachment.ts`:

```ts
import * as Schema from "effect/Schema"

export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024

export const RASTER_IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif"
] as const

export const ATTACHMENT_CONTENT_TYPES = [
  ...RASTER_IMAGE_CONTENT_TYPES,
  "application/pdf",
  "application/zip",
  "application/gzip",
  "application/x-tar"
] as const

export type AttachmentContentType = (typeof ATTACHMENT_CONTENT_TYPES)[number]

const normalizeContentType = (value: string) =>
  value.split(";")[0]!.trim().toLowerCase()

export const isAllowedAttachmentContentType = (value: string): boolean =>
  (ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(
    normalizeContentType(value)
  )

export const isRasterImageContentType = (value: string): boolean =>
  (RASTER_IMAGE_CONTENT_TYPES as readonly string[]).includes(
    normalizeContentType(value)
  )

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/

export const AttachmentId = Schema.String.pipe(
  Schema.pattern(ULID_PATTERN),
  Schema.brand("AttachmentId")
)
export type AttachmentId = typeof AttachmentId.Type

export const AttachmentStatus = Schema.Literal("pending", "live", "orphaned")
export type AttachmentStatus = typeof AttachmentStatus.Type

export const Attachment = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  filename: Schema.String,
  contentType: Schema.String,
  byteSize: Schema.Number,
  status: AttachmentStatus,
  uploadedBy: Schema.String,
  createdAt: Schema.Date
})
export type Attachment = typeof Attachment.Type

export const PrepareAttachmentInput = Schema.Struct({
  filename: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  contentType: Schema.String.pipe(Schema.minLength(1)),
  byteSize: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThan(0),
    Schema.lessThanOrEqualTo(ATTACHMENT_MAX_BYTES)
  )
})
export type PrepareAttachmentInput = typeof PrepareAttachmentInput.Type

export const PrepareAttachmentResult = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  uploadUrl: Schema.String,
  expiresAt: Schema.Date
})
export type PrepareAttachmentResult = typeof PrepareAttachmentResult.Type

export const OrgStorageStatus = Schema.Struct({
  status: Schema.Literal("not_connected", "active", "broken"),
  endpoint: Schema.NullOr(Schema.String),
  bucket: Schema.NullOr(Schema.String),
  region: Schema.NullOr(Schema.String),
  keyPrefix: Schema.NullOr(Schema.String),
  accessKeyIdMasked: Schema.NullOr(Schema.String),
  forcePathStyle: Schema.Boolean,
  connectedAt: Schema.NullOr(Schema.Date),
  lastCheckedAt: Schema.NullOr(Schema.Date),
  lastCheckError: Schema.NullOr(Schema.String)
})
export type OrgStorageStatus = typeof OrgStorageStatus.Type

export const ConnectStorageInput = Schema.Struct({
  endpoint: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(500)),
  bucket: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  region: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  accessKeyId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  secretAccessKey: Schema.String.pipe(Schema.minLength(1)),
  keyPrefix: Schema.NullOr(Schema.String.pipe(Schema.maxLength(255))),
  forcePathStyle: Schema.Boolean
})
export type ConnectStorageInput = typeof ConnectStorageInput.Type
```

- [ ] **Step 4: Write the pure URL helper module**

Create `packages/shared/src/attachments.ts`:

```ts
import { ULID_PATTERN } from "./schemas/Attachment"

export const ATTACHMENT_URL_PREFIX = "/api/attachments"

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const attachmentUrl = (orgSlug: string, id: string): string =>
  `${ATTACHMENT_URL_PREFIX}/${orgSlug}/${id}`

export interface AttachmentRef {
  readonly orgSlug: string
  readonly id: string
}

export const parseAttachmentUrl = (url: string): AttachmentRef | null => {
  if (!url.startsWith(`${ATTACHMENT_URL_PREFIX}/`)) return null
  const rest = url.slice(ATTACHMENT_URL_PREFIX.length + 1)
  const parts = rest.split("/")
  if (parts.length !== 2) return null
  const [orgSlug, id] = parts
  if (!orgSlug || !id) return null
  if (!SLUG_PATTERN.test(orgSlug)) return null
  if (!ULID_PATTERN.test(id)) return null
  return { orgSlug, id }
}

const ATTACHMENT_LINK_RE = /!?\[[^\]]*\]\((\/api\/attachments\/[^)\s]*)\)/g

export const extractAttachmentRefs = (
  markdown: string
): ReadonlyArray<AttachmentRef> => {
  const seen = new Set<string>()
  const out: AttachmentRef[] = []
  for (const match of markdown.matchAll(ATTACHMENT_LINK_RE)) {
    const ref = parseAttachmentUrl(match[1]!)
    if (!ref) continue
    const key = `${ref.orgSlug}/${ref.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}
```

- [ ] **Step 5: Append the wire errors**

Append to the end of `packages/shared/src/errors.ts`:

```ts
export class StorageNotConnected extends Schema.TaggedError<StorageNotConnected>()(
  "StorageNotConnected",
  {},
  HttpApiSchema.annotations({ status: 409 })
) {}

export class StorageAuthInvalid extends Schema.TaggedError<StorageAuthInvalid>()(
  "StorageAuthInvalid",
  {},
  HttpApiSchema.annotations({ status: 401 })
) {}

export class StorageConfigMissing extends Schema.TaggedError<StorageConfigMissing>()(
  "StorageConfigMissing",
  {},
  HttpApiSchema.annotations({ status: 503 })
) {}

export class StorageError extends Schema.TaggedError<StorageError>()(
  "StorageError",
  { reason: Schema.String },
  HttpApiSchema.annotations({ status: 502 })
) {}

export class AttachmentTooLarge extends Schema.TaggedError<AttachmentTooLarge>()(
  "AttachmentTooLarge",
  { maxBytes: Schema.Number },
  HttpApiSchema.annotations({ status: 413 })
) {}

export class AttachmentTypeRejected extends Schema.TaggedError<AttachmentTypeRejected>()(
  "AttachmentTypeRejected",
  { contentType: Schema.String },
  HttpApiSchema.annotations({ status: 415 })
) {}

export class AttachmentNotUploaded extends Schema.TaggedError<AttachmentNotUploaded>()(
  "AttachmentNotUploaded",
  {},
  HttpApiSchema.annotations({ status: 409 })
) {}
```

- [ ] **Step 6: Export the new modules**

In `packages/shared/src/index.ts`, add these two lines alongside the existing exports:

```ts
export * from "./schemas/Attachment"
export * from "./attachments"
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd packages/shared && bun run test`
Expected: PASS — all previous tests plus the new `attachments.test.ts` cases.

- [ ] **Step 8: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/schemas/Attachment.ts packages/shared/src/attachments.ts packages/shared/src/attachments.test.ts packages/shared/src/errors.ts packages/shared/src/index.ts
git commit -m "feat(attachments): shared attachment contract, allowlist and url helpers"
```

---

### Task 2: Database schema and migration

Adds the `s3` provider to the existing integration table, a sibling detail table for the connection, and the `attachment_index` table that maps an id to an object key.

**Files:**
- Modify: `packages/backend/src/db/schema.ts:192-226` (provider enum + config type), and append two tables
- Create: one generated file under `packages/backend/src/db/migrations/`

**Interfaces:**
- Consumes: `OrgStorageStatus` shape from Task 1 (informs column choices).
- Produces:
  - `organizationS3Integration` table: `{ organizationIntegrationId, endpoint, bucket, region, keyPrefix, forcePathStyle, accessKeyId, encryptedSecretKey, secretKeyNonce, secretKeyTag }`
  - `attachmentIndex` table: `{ id, organizationId, orgSlug, projectSlug, ticketId, objectKey, filename, contentType, byteSize, status, uploadedBy, createdAt, committedAt, orphanedAt }`

- [ ] **Step 1: Widen the provider enum and config type**

In `packages/backend/src/db/schema.ts`, change the `provider` column of `organizationIntegration` (line ~199) from:

```ts
    provider: text("provider", { enum: ["github", "everhour"] }).notNull(),
```

to:

```ts
    provider: text("provider", { enum: ["github", "everhour", "s3"] }).notNull(),
```

And change the `config` column (line ~203) from:

```ts
    config: jsonb("config").$type<OrgEverhourConfig>(),
```

to:

```ts
    config: jsonb("config").$type<OrgIntegrationConfig>(),
```

Then add the union type near the top of the file, after the imports:

```ts
export type OrgIntegrationConfig = OrgEverhourConfig | Record<string, never>
```

Keep the existing `OrgEverhourConfig` import.

- [ ] **Step 2: Add the S3 detail table**

Append after `organizationGithubIntegration` in `packages/backend/src/db/schema.ts`:

```ts
export const organizationS3Integration = pgTable(
  "organization_s3_integration",
  {
    organizationIntegrationId: uuid("organization_integration_id")
      .primaryKey()
      .references(() => organizationIntegration.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    bucket: text("bucket").notNull(),
    region: text("region").notNull(),
    keyPrefix: text("key_prefix"),
    forcePathStyle: boolean("force_path_style").notNull().default(true),
    accessKeyId: text("access_key_id").notNull(),
    encryptedSecretKey: text("encrypted_secret_key").notNull(),
    secretKeyNonce: text("secret_key_nonce").notNull(),
    secretKeyTag: text("secret_key_tag").notNull()
  }
)
```

If `boolean` is not already imported from `drizzle-orm/pg-core` at the top of the file, add it to the existing import list.

- [ ] **Step 3: Add the attachment index table**

Append at the end of `packages/backend/src/db/schema.ts`:

```ts
export const attachmentIndex = pgTable(
  "attachment_index",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    orgSlug: text("org_slug").notNull(),
    projectSlug: text("project_slug").notNull(),
    ticketId: text("ticket_id").notNull(),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    status: text("status", { enum: ["pending", "live", "orphaned"] })
      .notNull()
      .default("pending"),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    orphanedAt: timestamp("orphaned_at", { withTimezone: true })
  },
  (t) => [
    index("attachment_index_ticket_idx").on(
      t.orgSlug,
      t.projectSlug,
      t.ticketId
    ),
    index("attachment_index_status_idx").on(t.status),
    index("attachment_index_org_idx").on(t.organizationId)
  ]
)
```

If `integer` is not already imported from `drizzle-orm/pg-core`, add it.

- [ ] **Step 4: Start postgres and generate the migration**

Run:

```bash
bun run dev:db
cd packages/backend && bun run db:generate
```

Expected: a new `NNNN_<name>.sql` file in `packages/backend/src/db/migrations/` plus an updated `meta/_journal.json`.

- [ ] **Step 5: Inspect the generated SQL**

Run: `cat packages/backend/src/db/migrations/*.sql | tail -40`
Expected: `CREATE TABLE "organization_s3_integration"`, `CREATE TABLE "attachment_index"`, and no `DROP` statements. If the generator emits a destructive statement against an existing table, stop and report — do not apply it.

- [ ] **Step 6: Apply the migration**

Run: `cd packages/backend && bun run db:migrate`
Expected: applies cleanly.

- [ ] **Step 7: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/db/schema.ts packages/backend/src/db/migrations
git commit -m "feat(attachments): add s3 integration and attachment_index tables"
```

---

### Task 3: SecretCrypto service — lift AES-256-GCM out of the Everhour layer

The Everhour layer already seals secrets correctly, but its helpers are private and fail with `EverhourConfigMissing`. Storage needs the same sealing, so the helper becomes a service before a second caller copies it.

**Files:**
- Create: `packages/backend/src/Services/SecretCrypto.ts`
- Create: `packages/backend/src/Layers/SecretCrypto.ts`
- Create: `packages/backend/src/Layers/SecretCrypto.test.ts`
- Modify: `packages/backend/src/Layers/EverhourIntegrations.ts:85-140` (delete the private helpers, call the service)
- Modify: `packages/backend/src/runtime.ts` (merge the new layer)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SealedSecret = { readonly ciphertext: string; readonly nonce: string; readonly tag: string }`
  - `SecretCrypto` Context.Tag with shape:
    - `seal: (plaintext: string) => Effect.Effect<SealedSecret, SecretCryptoUnavailable>`
    - `open: (sealed: SealedSecret) => Effect.Effect<string, SecretCryptoUnavailable>`
  - `SecretCryptoUnavailable` — `Data.TaggedError`, internal only, never crosses the wire.
  - `SecretCryptoLive` Layer.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/Layers/SecretCrypto.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import * as Effect from "effect/Effect"
import { randomBytes } from "node:crypto"
import { SecretCrypto } from "../Services/SecretCrypto"
import { SecretCryptoLive } from "./SecretCrypto"

const withKey = <A>(run: () => Promise<A>) => async () => {
  const previous = process.env.USER_SECRET_ENCRYPTION_KEY
  process.env.USER_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("base64")
  try {
    return await run()
  } finally {
    process.env.USER_SECRET_ENCRYPTION_KEY = previous
  }
}

const run = <A, E>(effect: Effect.Effect<A, E, SecretCrypto>) =>
  Effect.runPromise(
    Effect.provide(effect, SecretCryptoLive) as Effect.Effect<A, E, never>
  )

describe("SecretCrypto", () => {
  it(
    "round-trips a secret",
    withKey(async () => {
      const opened = await run(
        Effect.gen(function* () {
          const crypto = yield* SecretCrypto
          const sealed = yield* crypto.seal("r2-secret-key")
          return yield* crypto.open(sealed)
        })
      )
      expect(opened).toBe("r2-secret-key")
    })
  )

  it(
    "produces a different nonce every time",
    withKey(async () => {
      const [a, b] = await run(
        Effect.gen(function* () {
          const crypto = yield* SecretCrypto
          return [yield* crypto.seal("same"), yield* crypto.seal("same")]
        })
      )
      expect(a.nonce).not.toBe(b.nonce)
      expect(a.ciphertext).not.toBe(b.ciphertext)
    })
  )

  it(
    "fails to open a tampered ciphertext",
    withKey(async () => {
      const result = await run(
        Effect.gen(function* () {
          const crypto = yield* SecretCrypto
          const sealed = yield* crypto.seal("r2-secret-key")
          return yield* Effect.either(
            crypto.open({
              ...sealed,
              ciphertext: Buffer.from("tampered").toString("base64")
            })
          )
        })
      )
      expect(result._tag).toBe("Left")
    })
  )

  it("fails when the key is absent", async () => {
    const previous = process.env.USER_SECRET_ENCRYPTION_KEY
    delete process.env.USER_SECRET_ENCRYPTION_KEY
    try {
      const result = await run(
        Effect.gen(function* () {
          const crypto = yield* SecretCrypto
          return yield* Effect.either(crypto.seal("x"))
        })
      )
      expect(result._tag).toBe("Left")
    } finally {
      process.env.USER_SECRET_ENCRYPTION_KEY = previous
    }
  })

  it("fails when the key is the wrong length", async () => {
    const previous = process.env.USER_SECRET_ENCRYPTION_KEY
    process.env.USER_SECRET_ENCRYPTION_KEY = Buffer.from("short").toString(
      "base64"
    )
    try {
      const result = await run(
        Effect.gen(function* () {
          const crypto = yield* SecretCrypto
          return yield* Effect.either(crypto.seal("x"))
        })
      )
      expect(result._tag).toBe("Left")
    } finally {
      process.env.USER_SECRET_ENCRYPTION_KEY = previous
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && bun run test SecretCrypto`
Expected: FAIL — `Cannot find module '../Services/SecretCrypto'`.

- [ ] **Step 3: Write the service definition**

Create `packages/backend/src/Services/SecretCrypto.ts`:

```ts
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import type * as Effect from "effect/Effect"

export class SecretCryptoUnavailable extends Data.TaggedError(
  "SecretCryptoUnavailable"
)<{ readonly reason: string }> {}

export interface SealedSecret {
  readonly ciphertext: string
  readonly nonce: string
  readonly tag: string
}

export interface SecretCryptoShape {
  readonly seal: (
    plaintext: string
  ) => Effect.Effect<SealedSecret, SecretCryptoUnavailable>
  readonly open: (
    sealed: SealedSecret
  ) => Effect.Effect<string, SecretCryptoUnavailable>
}

export class SecretCrypto extends Context.Tag(
  "@projectproject/backend/Services/SecretCrypto"
)<SecretCrypto, SecretCryptoShape>() {}
```

- [ ] **Step 4: Write the layer**

Create `packages/backend/src/Layers/SecretCrypto.ts`:

```ts
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import {
  SecretCrypto,
  SecretCryptoUnavailable,
  type SealedSecret
} from "../Services/SecretCrypto"

const encryptionKey = Effect.suspend(() => {
  const raw = process.env.USER_SECRET_ENCRYPTION_KEY
  if (!raw) {
    return Effect.zipRight(
      Effect.logWarning(
        "secret encryption is not configured: USER_SECRET_ENCRYPTION_KEY is missing"
      ),
      new SecretCryptoUnavailable({ reason: "key_missing" })
    )
  }
  const key = Buffer.from(raw, "base64")
  if (key.byteLength !== 32) {
    return Effect.zipRight(
      Effect.logWarning(
        "secret encryption is not configured: USER_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key"
      ),
      new SecretCryptoUnavailable({ reason: "key_length" })
    )
  }
  return Effect.succeed(key)
})

export const SecretCryptoLive = Layer.succeed(
  SecretCrypto,
  SecretCrypto.of({
    seal: (plaintext) =>
      Effect.gen(function* () {
        const key = yield* encryptionKey
        const nonce = randomBytes(12)
        const cipher = createCipheriv("aes-256-gcm", key, nonce)
        const encrypted = Buffer.concat([
          cipher.update(plaintext, "utf8"),
          cipher.final()
        ])
        return {
          ciphertext: encrypted.toString("base64"),
          nonce: nonce.toString("base64"),
          tag: cipher.getAuthTag().toString("base64")
        } satisfies SealedSecret
      }),
    open: (sealed) =>
      Effect.gen(function* () {
        const key = yield* encryptionKey
        return yield* Effect.try({
          try: () => {
            const decipher = createDecipheriv(
              "aes-256-gcm",
              key,
              Buffer.from(sealed.nonce, "base64")
            )
            decipher.setAuthTag(Buffer.from(sealed.tag, "base64"))
            return Buffer.concat([
              decipher.update(Buffer.from(sealed.ciphertext, "base64")),
              decipher.final()
            ]).toString("utf8")
          },
          catch: () => new SecretCryptoUnavailable({ reason: "open_failed" })
        })
      })
  })
)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/backend && bun run test SecretCrypto`
Expected: PASS — 5 tests.

- [ ] **Step 6: Repoint the Everhour layer at the service**

In `packages/backend/src/Layers/EverhourIntegrations.ts`:

1. Delete the private `encryptionKey`, `encryptSecret` and `decryptSecret` definitions (the block spanning roughly lines 85–145).
2. Add `import { SecretCrypto } from "../Services/SecretCrypto"` to the imports.
3. Acquire the service where the layer builds its other dependencies: `const secrets = yield* SecretCrypto`.
4. Replace each `yield* encryptSecret(apiKey)` call with:

```ts
const sealed = yield* secrets
  .seal(apiKey)
  .pipe(Effect.mapError(() => new EverhourConfigMissing()))
```

then map `sealed.ciphertext → encryptedApiKey`, `sealed.nonce → apiKeyNonce`, `sealed.tag → apiKeyTag` at the DB write.

5. Replace each `yield* decryptSecret(row)` call with:

```ts
const apiKey = yield* secrets
  .open({
    ciphertext: row.encryptedApiKey,
    nonce: row.apiKeyNonce,
    tag: row.apiKeyTag
  })
  .pipe(Effect.mapError(() => new EverhourConfigMissing()))
```

6. If `decryptSecret` was exported and imported elsewhere, update those callsites the same way. Check with: `grep -rn "decryptSecret\|encryptSecret" packages/backend/src`.

The column names in the Everhour table stay exactly as they are — this is an internal refactor, not a migration.

- [ ] **Step 7: Wire the layer into the runtime**

In `packages/backend/src/runtime.ts`, add `SecretCryptoLive` to the `BackendServicesLive` chain so `EverhourIntegrationsLive` can see it:

```ts
  Layer.provideMerge(
    EverhourIntegrationsLive.pipe(
      Layer.provideMerge(EverhourLive),
      Layer.provideMerge(SecretCryptoLive)
    )
  ),
```

and add `Layer.provideMerge(SecretCryptoLive),` as its own entry in the chain so later services can require it directly. Import it at the top: `import { SecretCryptoLive } from "./Layers/SecretCrypto"`.

- [ ] **Step 8: Run the full backend suite**

Run: `cd packages/backend && bun run test`
Expected: PASS — the existing 245 tests plus 5 new ones. The Everhour tests must still pass; they cover the pure planners, so a correct refactor leaves them untouched.

- [ ] **Step 9: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/backend/src/Services/SecretCrypto.ts packages/backend/src/Layers/SecretCrypto.ts packages/backend/src/Layers/SecretCrypto.test.ts packages/backend/src/Layers/EverhourIntegrations.ts packages/backend/src/runtime.ts
git commit -m "refactor(secrets): extract SecretCrypto service from Everhour layer"
```

---

### Task 4: S3Storage service — AWS SDK wrapper, object keys, MinIO for local dev

The thin seam over the S3 API. Everything above it speaks in terms of "presign a PUT for this key" and never touches the SDK.

**Files:**
- Create: `packages/backend/src/Services/S3Storage.ts`
- Create: `packages/backend/src/Layers/S3Storage.ts`
- Create: `packages/backend/src/Layers/S3Storage.test.ts`
- Modify: `packages/backend/package.json` (two dependencies)
- Modify: `docker-compose.yml` (MinIO service)
- Modify: `.env.example` (MinIO dev vars)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `S3Connection = { endpoint, bucket, region, keyPrefix, forcePathStyle, accessKeyId, secretAccessKey }`
  - `attachmentObjectKey(input: { keyPrefix: string | null; orgSlug: string; projectSlug: string; ticketId: string; attachmentId: string; filename: string }): string`
  - `S3Storage` Context.Tag with shape:
    - `presignPut: (c: S3Connection, key: string, contentType: string, expiresInSeconds: number) => Effect.Effect<string, S3Unavailable>`
    - `presignGet: (c: S3Connection, key: string, filename: string, inline: boolean, expiresInSeconds: number) => Effect.Effect<string, S3Unavailable>`
    - `headObject: (c: S3Connection, key: string) => Effect.Effect<{ byteSize: number; contentType: string | null } | null, S3Unavailable>`
    - `deleteObject: (c: S3Connection, key: string) => Effect.Effect<void, S3Unavailable>`
    - `checkConnection: (c: S3Connection) => Effect.Effect<void, S3Unavailable>`
  - `S3Unavailable` — `Data.TaggedError` with `{ reason: string; retryable: boolean }`, internal only.
  - `S3StorageLive` Layer.

- [ ] **Step 1: Add the dependencies**

Run: `cd packages/backend && bun add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
Expected: both appear under `dependencies` in `packages/backend/package.json` and `bun.lock` updates.

- [ ] **Step 2: Write the failing test**

Create `packages/backend/src/Layers/S3Storage.test.ts`. This tests only the pure key builder — no network, matching how the Everhour tests are written:

```ts
import { describe, expect, it } from "vitest"
import { attachmentObjectKey, sanitizeFilename } from "../Services/S3Storage"

const base = {
  keyPrefix: null,
  orgSlug: "acme",
  projectSlug: "web",
  ticketId: "T-12",
  attachmentId: "01JBX7Q2K9ZWCVE8MTQ4RXPGHN",
  filename: "screenshot.png"
}

describe("attachmentObjectKey", () => {
  it("namespaces by org, project and ticket", () => {
    expect(attachmentObjectKey(base)).toBe(
      "orgs/acme/projects/web/tickets/T-12/01JBX7Q2K9ZWCVE8MTQ4RXPGHN-screenshot.png"
    )
  })

  it("applies a key prefix when the bucket is shared", () => {
    expect(attachmentObjectKey({ ...base, keyPrefix: "projectproject" })).toBe(
      "projectproject/orgs/acme/projects/web/tickets/T-12/01JBX7Q2K9ZWCVE8MTQ4RXPGHN-screenshot.png"
    )
  })

  it("trims leading and trailing slashes from the prefix", () => {
    expect(attachmentObjectKey({ ...base, keyPrefix: "/pp/" })).toBe(
      "pp/orgs/acme/projects/web/tickets/T-12/01JBX7Q2K9ZWCVE8MTQ4RXPGHN-screenshot.png"
    )
  })

  it("keeps the attachment id as the uniqueness guarantee", () => {
    const a = attachmentObjectKey(base)
    const b = attachmentObjectKey({ ...base, attachmentId: "01JBX000000000000000000000" })
    expect(a).not.toBe(b)
  })
})

describe("sanitizeFilename", () => {
  it("strips path separators", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("etc-passwd")
  })

  it("strips characters that break object keys", () => {
    expect(sanitizeFilename("my file (1)?.png")).toBe("my-file-1.png")
  })

  it("collapses runs of separators", () => {
    expect(sanitizeFilename("a///b   c.png")).toBe("a-b-c.png")
  })

  it("preserves a normal filename", () => {
    expect(sanitizeFilename("screenshot.png")).toBe("screenshot.png")
  })

  it("falls back when the name sanitizes to nothing", () => {
    expect(sanitizeFilename("///")).toBe("file")
  })

  it("truncates an absurdly long name", () => {
    expect(sanitizeFilename(`${"a".repeat(300)}.png`).length).toBeLessThanOrEqual(
      120
    )
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/backend && bun run test S3Storage`
Expected: FAIL — `Cannot find module '../Services/S3Storage'`.

- [ ] **Step 4: Write the service definition with the pure helpers**

Create `packages/backend/src/Services/S3Storage.ts`:

```ts
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import type * as Effect from "effect/Effect"

export class S3Unavailable extends Data.TaggedError("S3Unavailable")<{
  readonly reason: string
  readonly retryable: boolean
}> {}

export interface S3Connection {
  readonly endpoint: string
  readonly bucket: string
  readonly region: string
  readonly keyPrefix: string | null
  readonly forcePathStyle: boolean
  readonly accessKeyId: string
  readonly secretAccessKey: string
}

const MAX_FILENAME_LENGTH = 120

export const sanitizeFilename = (filename: string): string => {
  const collapsed = filename
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/-+$/, "")
  if (collapsed === "" || collapsed === ".") return "file"
  if (collapsed.length <= MAX_FILENAME_LENGTH) return collapsed
  const dot = collapsed.lastIndexOf(".")
  if (dot <= 0) return collapsed.slice(0, MAX_FILENAME_LENGTH)
  const ext = collapsed.slice(dot)
  return `${collapsed.slice(0, MAX_FILENAME_LENGTH - ext.length)}${ext}`
}

export interface AttachmentKeyInput {
  readonly keyPrefix: string | null
  readonly orgSlug: string
  readonly projectSlug: string
  readonly ticketId: string
  readonly attachmentId: string
  readonly filename: string
}

export const attachmentObjectKey = (input: AttachmentKeyInput): string => {
  const prefix = (input.keyPrefix ?? "").replace(/^\/+|\/+$/g, "")
  const tail = `orgs/${input.orgSlug}/projects/${input.projectSlug}/tickets/${input.ticketId}/${input.attachmentId}-${sanitizeFilename(input.filename)}`
  return prefix === "" ? tail : `${prefix}/${tail}`
}

export interface S3ObjectHead {
  readonly byteSize: number
  readonly contentType: string | null
}

export interface S3StorageShape {
  readonly presignPut: (
    connection: S3Connection,
    key: string,
    contentType: string,
    expiresInSeconds: number
  ) => Effect.Effect<string, S3Unavailable>
  readonly presignGet: (
    connection: S3Connection,
    key: string,
    filename: string,
    inline: boolean,
    expiresInSeconds: number
  ) => Effect.Effect<string, S3Unavailable>
  readonly headObject: (
    connection: S3Connection,
    key: string
  ) => Effect.Effect<S3ObjectHead | null, S3Unavailable>
  readonly deleteObject: (
    connection: S3Connection,
    key: string
  ) => Effect.Effect<void, S3Unavailable>
  readonly checkConnection: (
    connection: S3Connection
  ) => Effect.Effect<void, S3Unavailable>
}

export class S3Storage extends Context.Tag(
  "@projectproject/backend/Services/S3Storage"
)<S3Storage, S3StorageShape>() {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/backend && bun run test S3Storage`
Expected: PASS — 10 tests.

- [ ] **Step 6: Write the layer**

Create `packages/backend/src/Layers/S3Storage.ts`:

```ts
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import {
  S3Storage,
  S3Unavailable,
  type S3Connection
} from "../Services/S3Storage"

const clientFor = (connection: S3Connection) =>
  new S3Client({
    region: connection.region,
    endpoint: connection.endpoint,
    forcePathStyle: connection.forcePathStyle,
    credentials: {
      accessKeyId: connection.accessKeyId,
      secretAccessKey: connection.secretAccessKey
    }
  })

const isAuthFailure = (cause: unknown) => {
  const name = (cause as { name?: string } | null)?.name ?? ""
  const status =
    (cause as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
      ?.httpStatusCode ?? 0
  return (
    status === 401 ||
    status === 403 ||
    name === "InvalidAccessKeyId" ||
    name === "SignatureDoesNotMatch" ||
    name === "AccessDenied"
  )
}

const isNotFound = (cause: unknown) => {
  const name = (cause as { name?: string } | null)?.name ?? ""
  const status =
    (cause as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
      ?.httpStatusCode ?? 0
  return status === 404 || name === "NotFound" || name === "NoSuchKey"
}

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new S3Unavailable({
        reason: isAuthFailure(cause)
          ? "auth"
          : ((cause as { name?: string } | null)?.name ?? "unknown"),
        retryable: !isAuthFailure(cause)
      })
  })

const withClient = <A>(
  connection: S3Connection,
  use: (client: S3Client) => Promise<A>
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => clientFor(connection)),
    (client) => attempt(() => use(client)),
    (client) => Effect.sync(() => client.destroy())
  )

export const S3StorageLive = Layer.succeed(
  S3Storage,
  S3Storage.of({
    presignPut: (connection, key, contentType, expiresInSeconds) =>
      withClient(connection, (client) =>
        getSignedUrl(
          client,
          new PutObjectCommand({
            Bucket: connection.bucket,
            Key: key,
            ContentType: contentType
          }),
          { expiresIn: expiresInSeconds }
        )
      ),
    presignGet: (connection, key, filename, inline, expiresInSeconds) =>
      withClient(connection, (client) =>
        getSignedUrl(
          client,
          new GetObjectCommand({
            Bucket: connection.bucket,
            Key: key,
            ResponseContentDisposition: `${inline ? "inline" : "attachment"}; filename="${filename.replace(/"/g, "")}"`
          }),
          { expiresIn: expiresInSeconds }
        )
      ),
    headObject: (connection, key) =>
      withClient(connection, async (client) => {
        try {
          const head = await client.send(
            new HeadObjectCommand({ Bucket: connection.bucket, Key: key })
          )
          return {
            byteSize: head.ContentLength ?? 0,
            contentType: head.ContentType ?? null
          }
        } catch (cause) {
          if (isNotFound(cause)) return null
          throw cause
        }
      }),
    deleteObject: (connection, key) =>
      withClient(connection, async (client) => {
        await client.send(
          new DeleteObjectCommand({ Bucket: connection.bucket, Key: key })
        )
      }),
    checkConnection: (connection) =>
      withClient(connection, async (client) => {
        await client.send(new HeadBucketCommand({ Bucket: connection.bucket }))
      })
  })
)
```

- [ ] **Step 7: Add MinIO to docker-compose**

In `docker-compose.yml`, add under `services:` after the `postgres` block:

```yaml
  minio:
    image: minio/minio:latest
    container_name: projectproject-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: projectproject
      MINIO_ROOT_PASSWORD: projectproject_dev
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 5
```

and add `minio_data:` under the existing `volumes:` block alongside `postgres_data:`.

- [ ] **Step 8: Document the dev bucket in .env.example**

Append to `.env.example`:

```
# Local S3-compatible storage (MinIO, via docker-compose).
# These are NOT read by the app — org storage credentials are entered in the
# UI and stored encrypted per-org. They are here so you know what to type
# into the Storage settings form when developing against MinIO:
#   endpoint          http://localhost:9000
#   region            us-east-1
#   access key id     projectproject
#   secret access key projectproject_dev
#   force path style  true
# Create the bucket first at http://localhost:9001 (console login uses the
# same credentials).
```

- [ ] **Step 9: Verify MinIO boots**

Run: `docker compose up -d minio && docker compose ps minio`
Expected: the container is running and healthy. Then `docker compose stop minio`.

- [ ] **Step 10: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add packages/backend/src/Services/S3Storage.ts packages/backend/src/Layers/S3Storage.ts packages/backend/src/Layers/S3Storage.test.ts packages/backend/package.json bun.lock docker-compose.yml .env.example
git commit -m "feat(attachments): S3Storage service over aws-sdk, MinIO for local dev"
```

---

### Task 5: OrgStorage service — connect, status, disconnect

Owns the org-level connection: the encrypted credential row, the connect-time round-trip check, and resolving a connection for the layers above.

**Files:**
- Create: `packages/backend/src/Services/OrgStorage.ts`
- Create: `packages/backend/src/Layers/OrgStorage.ts`
- Create: `packages/backend/src/Layers/OrgStorage.test.ts`
- Modify: `packages/backend/src/runtime.ts`

**Interfaces:**
- Consumes: `S3Storage`, `S3Connection`, `attachmentObjectKey` (Task 4); `SecretCrypto` (Task 3); `attachmentIndex`/`organizationS3Integration`/`organizationIntegration` tables (Task 2); `OrgStorageStatus`, `ConnectStorageInput`, storage errors (Task 1); existing `CurrentOrg` and `Db` services.
- Produces:
  - `maskAccessKeyId(value: string): string`
  - `OrgStorage` Context.Tag with shape:
    - `getStatus: (orgSlug: string, userId: string) => Effect.Effect<OrgStorageStatus, NotFound>`
    - `connect: (orgSlug: string, userId: string, input: ConnectStorageInput) => Effect.Effect<OrgStorageStatus, NotFound | Forbidden | StorageAuthInvalid | StorageConfigMissing | StorageError>`
    - `disconnect: (orgSlug: string, userId: string) => Effect.Effect<OrgStorageStatus, NotFound | Forbidden>`
    - `requireConnection: (orgSlug: string) => Effect.Effect<S3Connection, StorageNotConnected | StorageConfigMissing>`
  - `OrgStorageLive` Layer.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/Layers/OrgStorage.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { maskAccessKeyId } from "../Services/OrgStorage"

describe("maskAccessKeyId", () => {
  it("keeps the last four characters", () => {
    expect(maskAccessKeyId("AKIAIOSFODNN7EXAMPLE")).toBe("****************MPLE")
  })

  it("masks a short key entirely", () => {
    expect(maskAccessKeyId("abc")).toBe("***")
  })

  it("masks an empty key to an empty string", () => {
    expect(maskAccessKeyId("")).toBe("")
  })

  it("never reveals more than the last four characters", () => {
    const masked = maskAccessKeyId("projectproject")
    expect(masked.endsWith("ject")).toBe(true)
    expect(masked.startsWith("*")).toBe(true)
    expect(masked).toHaveLength("projectproject".length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && bun run test OrgStorage`
Expected: FAIL — `Cannot find module '../Services/OrgStorage'`.

- [ ] **Step 3: Write the service definition**

Create `packages/backend/src/Services/OrgStorage.ts`:

```ts
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type {
  ConnectStorageInput,
  Forbidden,
  NotFound,
  OrgStorageStatus,
  StorageAuthInvalid,
  StorageConfigMissing,
  StorageError,
  StorageNotConnected
} from "@projectproject/shared"
import type { S3Connection } from "./S3Storage"

export const maskAccessKeyId = (value: string): string => {
  if (value.length <= 4) return "*".repeat(value.length)
  return `${"*".repeat(value.length - 4)}${value.slice(-4)}`
}

export type OrgStorageConnectError =
  | NotFound
  | Forbidden
  | StorageAuthInvalid
  | StorageConfigMissing
  | StorageError

export interface OrgStorageShape {
  readonly getStatus: (
    orgSlug: string,
    userId: string
  ) => Effect.Effect<OrgStorageStatus, NotFound>
  readonly connect: (
    orgSlug: string,
    userId: string,
    input: ConnectStorageInput
  ) => Effect.Effect<OrgStorageStatus, OrgStorageConnectError>
  readonly disconnect: (
    orgSlug: string,
    userId: string
  ) => Effect.Effect<OrgStorageStatus, NotFound | Forbidden>
  readonly requireConnection: (
    orgSlug: string
  ) => Effect.Effect<S3Connection, StorageNotConnected | StorageConfigMissing>
}

export class OrgStorage extends Context.Tag(
  "@projectproject/backend/Services/OrgStorage"
)<OrgStorage, OrgStorageShape>() {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/backend && bun run test OrgStorage`
Expected: PASS — 4 tests.

- [ ] **Step 5: Write the layer**

Create `packages/backend/src/Layers/OrgStorage.ts`. Model the org-resolution and role-check shape on `packages/backend/src/Layers/GitHubIntegrations.ts` — read that file first and follow how it resolves an org via `CurrentOrg` and asserts the caller's role. The layer must:

1. `const db = yield* Db`, `const currentOrg = yield* CurrentOrg`, `const s3 = yield* S3Storage`, `const secrets = yield* SecretCrypto`.
2. `getStatus(orgSlug, userId)` — resolve the org (fail `NotFound` if the user can't see it), left-join `organizationIntegration` (provider `s3`) with `organizationS3Integration`. With no row, return `{ status: "not_connected", endpoint: null, bucket: null, region: null, keyPrefix: null, accessKeyIdMasked: null, forcePathStyle: true, connectedAt: null, lastCheckedAt: null, lastCheckError: null }`. With a row, map columns across and run `accessKeyId` through `maskAccessKeyId`. **Never** select the encrypted secret columns here.
3. `connect(orgSlug, userId, input)` — resolve the org; require the caller's role to be `owner` or `admin`, else `Forbidden`. Build an `S3Connection` from the input, then run the round-trip check in this order, so a bad credential is rejected before anything is written:
   - `s3.checkConnection(connection)`
   - `s3.presignPut` + an actual `fetch` PUT of a tiny body to a throwaway key (`<prefix>/.projectproject-connection-check/<ulid>`), then `s3.headObject` on it, then `s3.deleteObject`.
   Map `S3Unavailable` with `reason === "auth"` to `StorageAuthInvalid`, everything else to `StorageError({ reason })`. On success, `secrets.seal(input.secretAccessKey)` (mapping `SecretCryptoUnavailable → StorageConfigMissing`), then upsert: mark any existing active `s3` integration row `disconnected`, insert a fresh `organizationIntegration` row with `provider: "s3"`, `status: "active"`, `config: {}`, then insert the `organizationS3Integration` detail row. Set `lastCheckedAt` to now and `lastCheckStatus: "ok"`. Return the same shape `getStatus` returns.
   Wrap the two inserts in a transaction so a failure cannot leave an integration row without its detail row.
4. `disconnect(orgSlug, userId)` — resolve org, require `owner`/`admin`, set the active row's `status` to `disconnected` and `disconnectedAt` to now. Leave the detail row and the bucket objects alone; reconnecting is a fresh row. Return the `not_connected` status shape.
5. `requireConnection(orgSlug)` — internal, no user check (callers have already authorized). Select the active `s3` row joined to its detail row; no row means `StorageNotConnected`. `secrets.open(...)` the secret, mapping failure to `StorageConfigMissing`. Return the full `S3Connection`.

Export `OrgStorageLive` as a `Layer.effect(OrgStorage, ...)`.

- [ ] **Step 6: Wire into the runtime**

In `packages/backend/src/runtime.ts`, add to the `BackendServicesLive` chain:

```ts
  Layer.provideMerge(S3StorageLive),
  Layer.provideMerge(
    OrgStorageLive.pipe(
      Layer.provideMerge(S3StorageLive),
      Layer.provideMerge(SecretCryptoLive),
      Layer.provideMerge(CurrentOrgLive)
    )
  ),
```

with imports for `S3StorageLive` and `OrgStorageLive`.

- [ ] **Step 7: Run the backend suite and typecheck**

Run: `cd packages/backend && bun run test && cd ../.. && bun run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/Services/OrgStorage.ts packages/backend/src/Layers/OrgStorage.ts packages/backend/src/Layers/OrgStorage.test.ts packages/backend/src/runtime.ts
git commit -m "feat(attachments): OrgStorage service with connect-time round-trip check"
```

---

### Task 6: Storage API group and handler

Puts the org storage endpoints on the wire.

**Files:**
- Modify: `packages/shared/src/api.ts` (new `StorageGroup`, added to `AppApi`)
- Create: `packages/backend/src/handlers/storage.ts`
- Modify: `packages/backend/src/main.ts` (provide the handler layer)

**Interfaces:**
- Consumes: `OrgStorage` (Task 5); `OrgStorageStatus`, `ConnectStorageInput`, storage errors (Task 1).
- Produces: `StorageHandlerLive` Layer; client methods `client.storage.get({ path: { orgSlug } })`, `client.storage.connect({ path, payload })`, `client.storage.disconnect({ path })`.

- [ ] **Step 1: Add the API group**

In `packages/shared/src/api.ts`, add imports for `ConnectStorageInput` and `OrgStorageStatus` from `./schemas/Attachment`, and the four storage errors from `./errors`. Then add this group after `EverhourGroup`:

```ts
const StorageGroup = HttpApiGroup.make("storage")
  .add(
    HttpApiEndpoint.get("get", "/orgs/:orgSlug/storage")
      .setPath(OrgPath)
      .addSuccess(OrgStorageStatus)
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint.put("connect", "/orgs/:orgSlug/storage")
      .setPath(OrgPath)
      .setPayload(ConnectStorageInput)
      .addSuccess(OrgStorageStatus)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
      .addError(StorageAuthInvalid)
      .addError(StorageConfigMissing)
      .addError(StorageError)
  )
  .add(
    HttpApiEndpoint.del("disconnect", "/orgs/:orgSlug/storage")
      .setPath(OrgPath)
      .addSuccess(OrgStorageStatus)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
  )
  .middleware(Authentication)
```

Then add `.add(StorageGroup)` to the `AppApi` chain, after `.add(EverhourGroup)`.

- [ ] **Step 2: Write the handler**

Create `packages/backend/src/handlers/storage.ts`, following the shape of `packages/backend/src/handlers/everhour.ts` (read it first for how `CurrentUser` is read and how path params are destructured):

```ts
import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import * as Effect from "effect/Effect"
import { OrgStorage } from "../Services/OrgStorage"

export const StorageHandlerLive = HttpApiBuilder.group(
  AppApi,
  "storage",
  (handlers) =>
    handlers
      .handle("get", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const storage = yield* OrgStorage
          return yield* storage.getStatus(path.orgSlug, user.id)
        })
      )
      .handle("connect", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const storage = yield* OrgStorage
          return yield* storage.connect(path.orgSlug, user.id, payload)
        })
      )
      .handle("disconnect", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const storage = yield* OrgStorage
          return yield* storage.disconnect(path.orgSlug, user.id)
        })
      )
)
```

- [ ] **Step 3: Provide the handler layer**

In `packages/backend/src/main.ts`, add `import { StorageHandlerLive } from "./handlers/storage"` and add `Layer.provide(StorageHandlerLive),` to the `ApiLive` chain alongside the other handler layers.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: no errors. A missing handler for a declared group surfaces here as a type error on `ApiLive` — that is the check that the group is fully implemented.

- [ ] **Step 5: Boot the server**

Run: `bun run dev:db` then `cd packages/backend && timeout 20 bun run start 2>&1 | head -20`
Expected: the server starts without a layer-construction error. `Ctrl-C`/timeout is fine.

- [ ] **Step 6: Verify the route is registered**

With the server running, run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/orgs/project-project/storage`
Expected: `401` — the route exists and the auth middleware rejects an unauthenticated call. A `404` means the group was not mounted.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/api.ts packages/backend/src/handlers/storage.ts packages/backend/src/main.ts
git commit -m "feat(attachments): storage api group and handler"
```

---

### Task 7: Attachments service — prepare and commit

The upload handshake. `prepare` validates and reserves; `commit` verifies the real object against what the client declared, which is what makes the allowlist meaningful.

**Files:**
- Create: `packages/backend/src/Services/Attachments.ts`
- Create: `packages/backend/src/Layers/Attachments.ts`
- Create: `packages/backend/src/Layers/Attachments.test.ts`
- Modify: `packages/backend/src/runtime.ts`

**Interfaces:**
- Consumes: `OrgStorage.requireConnection` (Task 5); `S3Storage`, `attachmentObjectKey` (Task 4); `attachmentIndex` (Task 2); `PrepareAttachmentInput`, `PrepareAttachmentResult`, `Attachment`, allowlist/cap helpers, attachment errors, `attachmentUrl` (Task 1); existing `Projects` service for authorization.
- Produces:
  - `validateUploadRequest(input: { contentType: string; byteSize: number }): AttachmentValidationError | null` where `AttachmentValidationError = { kind: "type"; contentType: string } | { kind: "size"; maxBytes: number }`
  - `PENDING_TTL_MS: number` (3600000)
  - `Attachments` Context.Tag with shape:
    - `prepare: (orgSlug: string, slug: string, ticketId: string, userId: string, input: PrepareAttachmentInput) => Effect.Effect<PrepareAttachmentResult, NotFound | Forbidden | AttachmentTooLarge | AttachmentTypeRejected | StorageNotConnected | StorageConfigMissing | StorageError>`
    - `commit: (orgSlug: string, slug: string, ticketId: string, userId: string, attachmentId: string) => Effect.Effect<Attachment, NotFound | Forbidden | AttachmentNotUploaded | AttachmentTooLarge | AttachmentTypeRejected | StorageNotConnected | StorageConfigMissing | StorageError>`
    - `resolveForServing: (orgSlug: string, attachmentId: string, userId: string) => Effect.Effect<{ url: string }, NotFound | Forbidden | StorageNotConnected | StorageConfigMissing | StorageError>`
  - `AttachmentsLive` Layer.

- [ ] **Step 1: Write the failing test**

Create `packages/backend/src/Layers/Attachments.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { ATTACHMENT_MAX_BYTES } from "@projectproject/shared"
import { validateUploadRequest } from "../Services/Attachments"

describe("validateUploadRequest", () => {
  it("accepts an allowed type within the cap", () => {
    expect(
      validateUploadRequest({ contentType: "image/png", byteSize: 1024 })
    ).toBeNull()
  })

  it("rejects svg", () => {
    expect(
      validateUploadRequest({ contentType: "image/svg+xml", byteSize: 1024 })
    ).toEqual({ kind: "type", contentType: "image/svg+xml" })
  })

  it("rejects an executable", () => {
    expect(
      validateUploadRequest({
        contentType: "application/x-msdownload",
        byteSize: 1024
      })
    ).toEqual({ kind: "type", contentType: "application/x-msdownload" })
  })

  it("rejects a file over the cap", () => {
    expect(
      validateUploadRequest({
        contentType: "image/png",
        byteSize: ATTACHMENT_MAX_BYTES + 1
      })
    ).toEqual({ kind: "size", maxBytes: ATTACHMENT_MAX_BYTES })
  })

  it("accepts a file exactly at the cap", () => {
    expect(
      validateUploadRequest({
        contentType: "image/png",
        byteSize: ATTACHMENT_MAX_BYTES
      })
    ).toBeNull()
  })

  it("rejects a zero-byte file", () => {
    expect(
      validateUploadRequest({ contentType: "image/png", byteSize: 0 })
    ).toEqual({ kind: "size", maxBytes: ATTACHMENT_MAX_BYTES })
  })

  it("checks the type before the size", () => {
    expect(
      validateUploadRequest({
        contentType: "image/svg+xml",
        byteSize: ATTACHMENT_MAX_BYTES + 1
      })
    ).toEqual({ kind: "type", contentType: "image/svg+xml" })
  })

  it("tolerates a content type with parameters", () => {
    expect(
      validateUploadRequest({
        contentType: "image/png; charset=binary",
        byteSize: 10
      })
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && bun run test Attachments`
Expected: FAIL — `Cannot find module '../Services/Attachments'`.

- [ ] **Step 3: Write the service definition**

Create `packages/backend/src/Services/Attachments.ts`:

```ts
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import {
  ATTACHMENT_MAX_BYTES,
  isAllowedAttachmentContentType,
  type Attachment,
  type AttachmentNotUploaded,
  type AttachmentTooLarge,
  type AttachmentTypeRejected,
  type Forbidden,
  type NotFound,
  type PrepareAttachmentInput,
  type PrepareAttachmentResult,
  type StorageConfigMissing,
  type StorageError,
  type StorageNotConnected
} from "@projectproject/shared"

export const PENDING_TTL_MS = 60 * 60 * 1000

export type AttachmentValidationError =
  | { readonly kind: "type"; readonly contentType: string }
  | { readonly kind: "size"; readonly maxBytes: number }

export const validateUploadRequest = (input: {
  readonly contentType: string
  readonly byteSize: number
}): AttachmentValidationError | null => {
  if (!isAllowedAttachmentContentType(input.contentType)) {
    return { kind: "type", contentType: input.contentType }
  }
  if (input.byteSize <= 0 || input.byteSize > ATTACHMENT_MAX_BYTES) {
    return { kind: "size", maxBytes: ATTACHMENT_MAX_BYTES }
  }
  return null
}

export type AttachmentUploadError =
  | NotFound
  | Forbidden
  | AttachmentTooLarge
  | AttachmentTypeRejected
  | StorageNotConnected
  | StorageConfigMissing
  | StorageError

export interface AttachmentsShape {
  readonly prepare: (
    orgSlug: string,
    slug: string,
    ticketId: string,
    userId: string,
    input: PrepareAttachmentInput
  ) => Effect.Effect<PrepareAttachmentResult, AttachmentUploadError>
  readonly commit: (
    orgSlug: string,
    slug: string,
    ticketId: string,
    userId: string,
    attachmentId: string
  ) => Effect.Effect<
    Attachment,
    AttachmentUploadError | AttachmentNotUploaded
  >
  readonly resolveForServing: (
    orgSlug: string,
    attachmentId: string,
    userId: string
  ) => Effect.Effect<
    { readonly url: string },
    | NotFound
    | Forbidden
    | StorageNotConnected
    | StorageConfigMissing
    | StorageError
  >
}

export class Attachments extends Context.Tag(
  "@projectproject/backend/Services/Attachments"
)<Attachments, AttachmentsShape>() {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/backend && bun run test Attachments`
Expected: PASS — 8 tests.

- [ ] **Step 5: Write the layer**

Create `packages/backend/src/Layers/Attachments.ts` as a `Layer.effect(Attachments, ...)` acquiring `Db`, `OrgStorage`, `S3Storage` and `Projects`. Implement:

**`prepare`** —
1. `yield* projects.get(orgSlug, userId, slug)` to authorize; its `NotFound` is the natural failure for both an unknown project and a user who can't see it.
2. `const invalid = validateUploadRequest(input)`; on `kind === "type"` fail `new AttachmentTypeRejected({ contentType: invalid.contentType })`, on `kind === "size"` fail `new AttachmentTooLarge({ maxBytes: invalid.maxBytes })`.
3. `const connection = yield* orgStorage.requireConnection(orgSlug)`.
4. `const id = ulid()` (import `{ ulid } from "ulid"`).
5. `const objectKey = attachmentObjectKey({ keyPrefix: connection.keyPrefix, orgSlug, projectSlug: slug, ticketId, attachmentId: id, filename: input.filename })`.
6. `const uploadUrl = yield* s3.presignPut(connection, objectKey, input.contentType, 900)`, mapping `S3Unavailable` to `StorageError({ reason })`.
7. Insert the `attachmentIndex` row with `status: "pending"`, `uploadedBy: userId`, the resolved `organizationId`, and the declared `contentType`/`byteSize`.
8. Return `{ id, url: attachmentUrl(orgSlug, id), uploadUrl, expiresAt: new Date(Date.now() + 900_000) }`.

**`commit`** —
1. Authorize the same way.
2. Select the row by `id` **and** `orgSlug`, `projectSlug`, `ticketId` — never by id alone, so one org cannot commit another's row. No row means `NotFound`.
3. If `status === "live"`, return the existing attachment (idempotent — a retried commit must not fail).
4. `requireConnection`, then `const head = yield* s3.headObject(connection, row.objectKey)`. `null` means the browser never completed the PUT: fail `AttachmentNotUploaded`.
5. Re-validate against the **real** object, not the declared values: `validateUploadRequest({ contentType: head.contentType ?? row.contentType, byteSize: head.byteSize })`. On failure, delete the object and the row, then fail with the matching error. This is the check that makes the allowlist real.
6. Also fail `AttachmentTooLarge` if `head.byteSize !== row.byteSize` — a mismatch means the client lied at prepare time. Delete object and row first.
7. Update the row: `status: "live"`, `committedAt: now`, and store the observed `contentType`/`byteSize`.
8. Return the `Attachment` shape with `url: attachmentUrl(orgSlug, row.id)`.

**`resolveForServing`** —
1. Select the row by `id` and `orgSlug`. No row, or `status !== "live"`, means `NotFound`.
2. `yield* projects.get(orgSlug, userId, row.projectSlug)` to authorize the caller against the owning project; `NotFound` from that call maps to `Forbidden` here, so a probe can't distinguish "wrong org" from "no such attachment".
3. `requireConnection`, then `s3.presignGet(connection, row.objectKey, row.filename, isRasterImageContentType(row.contentType), 60)`.
4. Return `{ url }`.

- [ ] **Step 6: Wire into the runtime**

In `packages/backend/src/runtime.ts` add to `BackendServicesLive`:

```ts
  Layer.provideMerge(
    AttachmentsLive.pipe(
      Layer.provideMerge(S3StorageLive),
      Layer.provideMerge(ProjectsLive)
    )
  ),
```

- [ ] **Step 7: Run the suite and typecheck**

Run: `cd packages/backend && bun run test && cd ../.. && bun run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/Services/Attachments.ts packages/backend/src/Layers/Attachments.ts packages/backend/src/Layers/Attachments.test.ts packages/backend/src/runtime.ts
git commit -m "feat(attachments): prepare/commit handshake with head-object verification"
```

---

### Task 8: Attachments API group, handler, and the serving redirect route

Two halves of the same surface: the typed prepare/commit endpoints, and the raw redirect route that the markdown URL actually points at.

**Files:**
- Modify: `packages/shared/src/api.ts` (new `AttachmentsGroup`, added to `AppApi`)
- Create: `packages/backend/src/handlers/attachments.ts`
- Create: `packages/backend/src/http/attachmentRoutes.ts`
- Modify: `packages/backend/src/main.ts` (handler layer + raw mount)

**Interfaces:**
- Consumes: `Attachments` service (Task 7); `PrepareAttachmentInput`, `PrepareAttachmentResult`, `Attachment` (Task 1); `BetterAuth`, `toWebHeaders` (existing).
- Produces: `AttachmentsHandlerLive` Layer; `attachmentRoutes` HttpRouter; client methods `client.attachments.prepare({ path, payload })` and `client.attachments.commit({ path })`.

- [ ] **Step 1: Add the API group**

In `packages/shared/src/api.ts`, add an `AttachmentPath` schema next to the existing `TicketPath`:

```ts
const AttachmentPath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  id: TicketId,
  attachmentId: Schema.String
})
```

Then the group:

```ts
const AttachmentsGroup = HttpApiGroup.make("attachments")
  .add(
    HttpApiEndpoint.post(
      "prepare",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/attachments/prepare"
    )
      .setPath(TicketPath)
      .setPayload(PrepareAttachmentInput)
      .addSuccess(PrepareAttachmentResult)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
      .addError(AttachmentTooLarge)
      .addError(AttachmentTypeRejected)
      .addError(StorageNotConnected)
      .addError(StorageConfigMissing)
      .addError(StorageError)
  )
  .add(
    HttpApiEndpoint.post(
      "commit",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/attachments/:attachmentId/commit"
    )
      .setPath(AttachmentPath)
      .addSuccess(Attachment)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
      .addError(AttachmentNotUploaded)
      .addError(AttachmentTooLarge)
      .addError(AttachmentTypeRejected)
      .addError(StorageNotConnected)
      .addError(StorageConfigMissing)
      .addError(StorageError)
  )
  .middleware(Authentication)
```

Add `.add(AttachmentsGroup)` to `AppApi` after `.add(StorageGroup)`, and import the new schemas and errors.

- [ ] **Step 2: Write the handler**

Create `packages/backend/src/handlers/attachments.ts`:

```ts
import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import * as Effect from "effect/Effect"
import { Attachments } from "../Services/Attachments"

export const AttachmentsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "attachments",
  (handlers) =>
    handlers
      .handle("prepare", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const attachments = yield* Attachments
          return yield* attachments.prepare(
            path.orgSlug,
            path.slug,
            path.id,
            user.id,
            payload
          )
        })
      )
      .handle("commit", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const attachments = yield* Attachments
          return yield* attachments.commit(
            path.orgSlug,
            path.slug,
            path.id,
            user.id,
            path.attachmentId
          )
        })
      )
)
```

- [ ] **Step 3: Write the raw serving route**

Create `packages/backend/src/http/attachmentRoutes.ts`. This cannot be a typed HttpApi endpoint because it returns a `302`, and it cannot use the `Authentication` middleware because that is HttpApi-only — so it resolves the session the same way `betterAuthApp` does. Model the error handling on `githubSetupRoute` in `main.ts`:

```ts
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { parseAttachmentUrl } from "@projectproject/shared"
import * as Effect from "effect/Effect"
import { toWebHeaders } from "./toWebHeaders"
import { Attachments } from "../Services/Attachments"
import { BetterAuth } from "../Services/BetterAuth"

const notFound = HttpServerResponse.text("Not Found", { status: 404 })

const serveAttachment = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const webReq = yield* HttpServerRequest.toWeb(req)
  const url = new URL(webReq.url)
  const ref = parseAttachmentUrl(url.pathname)
  if (!ref) return notFound

  const ba = yield* BetterAuth
  const session = yield* ba
    .getSession(toWebHeaders(req.headers))
    .pipe(Effect.orElseSucceed(() => null))
  if (session === null) {
    return HttpServerResponse.text("Unauthorized", { status: 401 })
  }

  const attachments = yield* Attachments
  const { url: signed } = yield* attachments.resolveForServing(
    ref.orgSlug,
    ref.id,
    session.user.id
  )
  return HttpServerResponse.redirect(signed, {
    status: 302,
    headers: { "cache-control": "private, no-store" }
  })
}).pipe(
  Effect.catchTags({
    NotFound: () => notFound,
    Forbidden: () => notFound,
    StorageNotConnected: () => notFound,
    StorageConfigMissing: () =>
      HttpServerResponse.text("Storage unavailable", { status: 503 }),
    StorageError: () =>
      HttpServerResponse.text("Storage unavailable", { status: 502 })
  }),
  Effect.catchAllCause((cause) =>
    Effect.zipRight(
      Effect.logError("attachment route failure", cause),
      HttpServerResponse.text("Attachment failed", { status: 500 })
    )
  )
)

export const attachmentRoutes = HttpRouter.empty.pipe(
  HttpRouter.get("/:orgSlug/:attachmentId", serveAttachment)
)
```

Note `parseAttachmentUrl` is fed the **full pathname**, which is why the helper's prefix check matters — a mounted router strips the prefix from its own matching but `webReq.url` still carries it. Verify this at runtime in Step 6; if the pathname arrives stripped, build the ref from the router's path params instead.

`Forbidden` deliberately renders as `404` so an attachment id cannot be probed across orgs.

- [ ] **Step 4: Mount both in main.ts**

In `packages/backend/src/main.ts`:

1. Add `import { AttachmentsHandlerLive } from "./handlers/attachments"` and `import { attachmentRoutes } from "./http/attachmentRoutes"`.
2. Add `Layer.provide(AttachmentsHandlerLive),` to the `ApiLive` chain.
3. In `ServerLive`, add the mount **before** the `/api` catch-all:

```ts
    HttpRouter.mountApp("/api/attachments", attachmentRoutes),
    HttpRouter.mountApp("/api", apiApp),
```

Order matters exactly as it does for `/api/auth` — the more specific prefix must be registered first.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 6: Verify both routes are live**

Start the server (`bun run dev:db`, then `cd packages/backend && bun run start`) and in another shell:

```bash
curl -s -o /dev/null -w "prepare:%{http_code}\n" -X POST http://localhost:3000/api/orgs/project-project/projects/project-project/tickets/T-1/attachments/prepare
curl -s -o /dev/null -w "serve:%{http_code}\n" http://localhost:3000/api/attachments/project-project/01JBX7Q2K9ZWCVE8MTQ4RXPGHN
```

Expected: `prepare:401` (route exists, auth rejects) and `serve:401` (route exists, no session). A `404` on either means the mount order or path is wrong. Also check the server log for the "attachment route failure" line — it should not appear.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/api.ts packages/backend/src/handlers/attachments.ts packages/backend/src/http/attachmentRoutes.ts packages/backend/src/main.ts
git commit -m "feat(attachments): prepare/commit endpoints and presigned serving redirect"
```

---

### Task 9: Reference reconciliation and the orphan reaper

Closes the lifecycle. A description that drops an image marks the row `orphaned` at save time; a scheduled sweep deletes objects after a grace period.

**Files:**
- Modify: `packages/backend/src/Services/Attachments.ts` (extend the shape)
- Modify: `packages/backend/src/Layers/Attachments.ts` (implement reconcile + reap planning)
- Modify: `packages/backend/src/Layers/Attachments.test.ts` (planner tests)
- Modify: `packages/backend/src/Layers/Tickets.ts:523-536` (call reconcile from the description-save path)
- Create: `packages/backend/src/Layers/AttachmentReaper.ts`
- Create: `packages/backend/src/Layers/AttachmentReaper.test.ts`
- Modify: `packages/backend/src/main.ts` (reaper layer)

**Interfaces:**
- Consumes: `extractAttachmentRefs` (Task 1); `Attachments` service (Task 7); the `Tickets` layer's `validateBody` seam.
- Produces:
  - `planReconciliation(input: { referenced: ReadonlySet<string>; rows: ReadonlyArray<{ id: string; status: "pending" | "live" | "orphaned" }> }): { toOrphan: ReadonlyArray<string>; toRestore: ReadonlyArray<string> }`
  - `planReap(input: { now: number; rows: ReadonlyArray<{ id: string; status: "pending" | "live" | "orphaned"; createdAt: Date; orphanedAt: Date | null }> }): ReadonlyArray<string>`
  - `ORPHAN_GRACE_MS: number` (604800000 — 7 days)
  - `REAPER_INTERVAL_MS: number` (3600000)
  - `Attachments.reconcileTicket: (orgSlug: string, slug: string, ticketId: string, body: string) => Effect.Effect<void>`
  - `Attachments.reapOnce: () => Effect.Effect<{ deleted: number }>`
  - `AttachmentReaperLive` Layer.

- [ ] **Step 1: Write the failing planner tests**

Append to `packages/backend/src/Layers/Attachments.test.ts`:

```ts
import {
  ORPHAN_GRACE_MS,
  planReap,
  planReconciliation
} from "../Services/Attachments"

describe("planReconciliation", () => {
  it("orphans a live row the body no longer references", () => {
    const plan = planReconciliation({
      referenced: new Set(["a"]),
      rows: [
        { id: "a", status: "live" },
        { id: "b", status: "live" }
      ]
    })
    expect(plan.toOrphan).toEqual(["b"])
    expect(plan.toRestore).toEqual([])
  })

  it("restores an orphaned row the body references again", () => {
    const plan = planReconciliation({
      referenced: new Set(["a"]),
      rows: [{ id: "a", status: "orphaned" }]
    })
    expect(plan.toRestore).toEqual(["a"])
    expect(plan.toOrphan).toEqual([])
  })

  it("leaves pending rows alone", () => {
    const plan = planReconciliation({
      referenced: new Set(),
      rows: [{ id: "a", status: "pending" }]
    })
    expect(plan.toOrphan).toEqual([])
    expect(plan.toRestore).toEqual([])
  })

  it("is a no-op when everything is referenced", () => {
    const plan = planReconciliation({
      referenced: new Set(["a", "b"]),
      rows: [
        { id: "a", status: "live" },
        { id: "b", status: "live" }
      ]
    })
    expect(plan.toOrphan).toEqual([])
    expect(plan.toRestore).toEqual([])
  })

  it("ignores a referenced id with no row", () => {
    const plan = planReconciliation({
      referenced: new Set(["ghost"]),
      rows: [{ id: "a", status: "live" }]
    })
    expect(plan.toOrphan).toEqual(["a"])
    expect(plan.toRestore).toEqual([])
  })
})

describe("planReap", () => {
  const now = Date.UTC(2026, 8, 2)

  it("reaps a pending row past its ttl", () => {
    expect(
      planReap({
        now,
        rows: [
          {
            id: "a",
            status: "pending",
            createdAt: new Date(now - 2 * 60 * 60 * 1000),
            orphanedAt: null
          }
        ]
      })
    ).toEqual(["a"])
  })

  it("spares a pending row inside its ttl", () => {
    expect(
      planReap({
        now,
        rows: [
          {
            id: "a",
            status: "pending",
            createdAt: new Date(now - 60 * 1000),
            orphanedAt: null
          }
        ]
      })
    ).toEqual([])
  })

  it("reaps an orphaned row past the grace period", () => {
    expect(
      planReap({
        now,
        rows: [
          {
            id: "a",
            status: "orphaned",
            createdAt: new Date(now - ORPHAN_GRACE_MS * 2),
            orphanedAt: new Date(now - ORPHAN_GRACE_MS - 1000)
          }
        ]
      })
    ).toEqual(["a"])
  })

  it("spares an orphaned row inside the grace period", () => {
    expect(
      planReap({
        now,
        rows: [
          {
            id: "a",
            status: "orphaned",
            createdAt: new Date(now - ORPHAN_GRACE_MS * 2),
            orphanedAt: new Date(now - 1000)
          }
        ]
      })
    ).toEqual([])
  })

  it("never reaps a live row", () => {
    expect(
      planReap({
        now,
        rows: [
          {
            id: "a",
            status: "live",
            createdAt: new Date(now - ORPHAN_GRACE_MS * 10),
            orphanedAt: null
          }
        ]
      })
    ).toEqual([])
  })

  it("spares an orphaned row with a null orphanedAt", () => {
    expect(
      planReap({
        now,
        rows: [
          {
            id: "a",
            status: "orphaned",
            createdAt: new Date(now - ORPHAN_GRACE_MS * 10),
            orphanedAt: null
          }
        ]
      })
    ).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/backend && bun run test Attachments`
Expected: FAIL — `planReconciliation` is not exported.

- [ ] **Step 3: Add the pure planners**

Append to `packages/backend/src/Services/Attachments.ts`:

```ts
export const ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000
export const REAPER_INTERVAL_MS = 60 * 60 * 1000

export interface ReconciliationRow {
  readonly id: string
  readonly status: "pending" | "live" | "orphaned"
}

export const planReconciliation = (input: {
  readonly referenced: ReadonlySet<string>
  readonly rows: ReadonlyArray<ReconciliationRow>
}): {
  readonly toOrphan: ReadonlyArray<string>
  readonly toRestore: ReadonlyArray<string>
} => {
  const toOrphan: string[] = []
  const toRestore: string[] = []
  for (const row of input.rows) {
    if (row.status === "pending") continue
    const referenced = input.referenced.has(row.id)
    if (row.status === "live" && !referenced) toOrphan.push(row.id)
    if (row.status === "orphaned" && referenced) toRestore.push(row.id)
  }
  return { toOrphan, toRestore }
}

export interface ReapRow {
  readonly id: string
  readonly status: "pending" | "live" | "orphaned"
  readonly createdAt: Date
  readonly orphanedAt: Date | null
}

export const planReap = (input: {
  readonly now: number
  readonly rows: ReadonlyArray<ReapRow>
}): ReadonlyArray<string> =>
  input.rows
    .filter((row) => {
      if (row.status === "pending") {
        return input.now - row.createdAt.getTime() > PENDING_TTL_MS
      }
      if (row.status === "orphaned") {
        if (row.orphanedAt === null) return false
        return input.now - row.orphanedAt.getTime() > ORPHAN_GRACE_MS
      }
      return false
    })
    .map((row) => row.id)
```

Also extend `AttachmentsShape` with:

```ts
  readonly reconcileTicket: (
    orgSlug: string,
    slug: string,
    ticketId: string,
    body: string
  ) => Effect.Effect<void>
  readonly reapOnce: () => Effect.Effect<{ readonly deleted: number }>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/backend && bun run test Attachments`
Expected: PASS — 8 earlier tests plus 12 planner tests.

- [ ] **Step 5: Implement the two methods in the layer**

In `packages/backend/src/Layers/Attachments.ts`:

`reconcileTicket(orgSlug, slug, ticketId, body)` —
1. `const referenced = new Set(extractAttachmentRefs(body).filter((r) => r.orgSlug === orgSlug).map((r) => r.id))`.
2. Select all `attachmentIndex` rows for `(orgSlug, projectSlug, ticketId)`.
3. `const plan = planReconciliation({ referenced, rows })`.
4. If `plan.toOrphan` is non-empty, update those rows to `status: "orphaned"`, `orphanedAt: now`. If `plan.toRestore` is non-empty, update to `status: "live"`, `orphanedAt: null`.
5. The whole method returns `Effect.Effect<void>` — no error channel. A reconciliation failure must never block a description save, so end the implementation with `Effect.catchAllCause((cause) => Effect.logError("attachment reconciliation failed", cause))`.

`reapOnce()` —
1. Select candidate rows: `status` in `("pending", "orphaned")`.
2. `const ids = planReap({ now: Date.now(), rows })`.
3. For each id: resolve the org connection, `s3.deleteObject`, then delete the row. Per-row failures are logged and skipped — one broken bucket must not stall the sweep. Group rows by `orgSlug` so `requireConnection` is called once per org, not once per row.
4. Return `{ deleted }`. Same `catchAllCause` treatment; the reaper never fails.

- [ ] **Step 6: Hook reconciliation into the description-save path**

In `packages/backend/src/Layers/Tickets.ts`, the `validateBody` helper at line ~523 is called on ticket create and update. Reconciliation is not validation, so add it as its own call rather than overloading that helper. Acquire the service in the layer (`const attachments = yield* Attachments`) and, in each place where a ticket's description has just been written, add:

```ts
yield* attachments.reconcileTicket(orgSlug, slug, id, body)
```

Place it **after** the markdown write succeeds, so the DB never claims a reference the file doesn't have. Find the write sites with `grep -n "writeTicketWithRegion\|writeTicketFile" packages/backend/src/Layers/Tickets.ts`.

Adding `Attachments` to the `Tickets` layer's requirements creates a dependency edge — `TicketsLive` now needs `AttachmentsLive` beneath it in `runtime.ts`. Check for a cycle: `Attachments` depends on `Projects`, and `Projects` does not depend on `Tickets`, so there is none. If the compiler reports one, stop and report rather than restructuring.

- [ ] **Step 7: Write the reaper layer and its test**

Create `packages/backend/src/Layers/AttachmentReaper.ts`, modelled on `TicketIndexReconciler.ts`:

```ts
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as Duration from "effect/Duration"
import { Attachments, REAPER_INTERVAL_MS } from "../Services/Attachments"

export const reapAttachments = Effect.gen(function* () {
  const attachments = yield* Attachments
  const { deleted } = yield* attachments.reapOnce()
  if (deleted > 0) {
    yield* Effect.logInfo("attachment reap complete", { deleted })
  }
}).pipe(
  Effect.catchAllCause((cause) =>
    Effect.logError("attachment reap failed", cause)
  )
)

export const AttachmentReaperLive = Layer.effectDiscard(
  Effect.forkDaemon(
    Effect.repeat(
      reapAttachments,
      Schedule.spaced(Duration.millis(REAPER_INTERVAL_MS))
    )
  )
)
```

Create `packages/backend/src/Layers/AttachmentReaper.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { REAPER_INTERVAL_MS } from "../Services/Attachments"

describe("reaper cadence", () => {
  it("sweeps hourly", () => {
    expect(REAPER_INTERVAL_MS).toBe(60 * 60 * 1000)
  })

  it("sweeps at least as often as the pending ttl", async () => {
    const { PENDING_TTL_MS } = await import("../Services/Attachments")
    expect(REAPER_INTERVAL_MS).toBeLessThanOrEqual(PENDING_TTL_MS)
  })
})
```

- [ ] **Step 8: Mount the reaper**

In `packages/backend/src/main.ts`, alongside `ReconcilerLive`:

```ts
const ReaperLive = AttachmentReaperLive.pipe(
  Layer.provide(BackendHttpServicesLive),
  Layer.provide(BackendInfrastructureLive)
)

const AppLive = Layer.mergeAll(ServerLive, ReconcilerLive, ReaperLive)
```

replacing the existing `Layer.merge(ServerLive, ReconcilerLive)`.

- [ ] **Step 9: Run the full suite and typecheck**

Run: `cd packages/backend && bun run test && cd ../.. && bun run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 10: Boot and confirm the reaper starts**

Run the server and check the log. Expected: no "attachment reap failed" line within the first minute. With no rows to reap, `reapOnce` logs nothing — silence is success.

- [ ] **Step 11: Commit**

```bash
git add packages/backend/src/Services/Attachments.ts packages/backend/src/Layers/Attachments.ts packages/backend/src/Layers/Attachments.test.ts packages/backend/src/Layers/Tickets.ts packages/backend/src/Layers/AttachmentReaper.ts packages/backend/src/Layers/AttachmentReaper.test.ts packages/backend/src/main.ts packages/backend/src/runtime.ts
git commit -m "feat(attachments): reference reconciliation on save and hourly orphan reaper"
```

---

### Task 10: Storage settings UI

The org owner's connect form. Backend is complete at this point, so this task is the first one a human can click.

**Files:**
- Create: `packages/frontend/src/atoms/storage.ts`
- Create: `packages/frontend/src/routes/_authed/orgs/$orgSlug/settings/storage.tsx`
- Modify: `packages/frontend/src/routes/_authed/orgs/$orgSlug/settings/route.tsx`
- Modify: `packages/frontend/src/lib/errorMessage.ts`
- Modify: `packages/frontend/messages/en/projects.json`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `client.storage.*` (Task 6); `OrgStorageStatus`, `ConnectStorageInput` (Task 1); existing `orgKey` from `@/atoms/orgs`.
- Produces: `orgStorageAtom`, `connectStorageAtom`, `disconnectStorageAtom` (all family-keyed by `orgKey(orgSlug)`).

- [ ] **Step 1: Write the atoms**

Create `packages/frontend/src/atoms/storage.ts`, following `packages/frontend/src/atoms/everhour.ts` exactly:

```ts
import { Atom, Result } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import type { ConnectStorageInput } from "@projectproject/shared"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"

const orgStorageBaseAtom = Atom.family((orgSlug: string) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.storage.get({ path: { orgSlug } })
      })
    )
    .pipe(Atom.setIdleTTL("30 seconds"))
)

export const orgStorageAtom = Atom.family((orgSlug: string) =>
  Atom.optimistic(orgStorageBaseAtom(orgSlug))
)

export const connectStorageAtom = Atom.family((orgSlug: string) =>
  Atom.optimisticFn(orgStorageAtom(orgSlug), {
    reducer: (current) =>
      Result.isSuccess(current)
        ? Result.success(current.value, { waiting: true })
        : current,
    fn: runtime.fn(
      Effect.fn(function* (input: ConnectStorageInput, get) {
        const client = yield* ApiClient
        const status = yield* client.storage.connect({
          path: { orgSlug },
          payload: input
        })
        get.refresh(orgStorageBaseAtom(orgSlug))
        return status
      })
    )
  })
)

export const disconnectStorageAtom = Atom.family((orgSlug: string) =>
  Atom.optimisticFn(orgStorageAtom(orgSlug), {
    reducer: (current) =>
      Result.isSuccess(current)
        ? Result.success(
            {
              ...current.value,
              status: "not_connected" as const,
              endpoint: null,
              bucket: null,
              region: null,
              keyPrefix: null,
              accessKeyIdMasked: null,
              connectedAt: null,
              lastCheckedAt: null,
              lastCheckError: null
            },
            { waiting: true }
          )
        : current,
    fn: runtime.fn(
      Effect.fn(function* (_input: void, get) {
        const client = yield* ApiClient
        const status = yield* client.storage.disconnect({ path: { orgSlug } })
        get.refresh(orgStorageBaseAtom(orgSlug))
        return status
      })
    )
  })
)
```

The reducer for `connect` is pulse-only, per the plan's global constraints — the server assigns `connectedAt` and the masked key, so inventing them would display fiction for a beat.

- [ ] **Step 2: Add the i18n keys**

In `packages/frontend/messages/en/projects.json`, add these keys in the `storage_` prefix group, placed after the `project_` group and before `members_` to keep the file's prefix ordering:

```json
  "storage_heading": "Object storage",
  "storage_description": "Connect an S3-compatible bucket to store ticket attachments.",
  "storage_tab": "Storage",
  "storage_crumb": "Storage",
  "storage_not_connected": "No bucket connected",
  "storage_not_connected_hint": "Members can't attach files to tickets until a bucket is connected.",
  "storage_connected": "Connected",
  "storage_endpoint_label": "Endpoint",
  "storage_endpoint_placeholder": "https://<account>.r2.cloudflarestorage.com",
  "storage_bucket_label": "Bucket",
  "storage_region_label": "Region",
  "storage_region_hint": "Cloudflare R2 uses \"auto\".",
  "storage_access_key_label": "Access key ID",
  "storage_secret_key_label": "Secret access key",
  "storage_secret_key_hint": "Stored encrypted. Never shown again after saving.",
  "storage_key_prefix_label": "Key prefix (optional)",
  "storage_key_prefix_hint": "Use this when the bucket is shared with other applications.",
  "storage_force_path_style_label": "Use path-style addressing",
  "storage_connect_button": "Connect bucket",
  "storage_connecting": "Testing connection…",
  "storage_disconnect_button": "Disconnect",
  "storage_disconnect_confirm": "Disconnect this bucket?",
  "storage_disconnect_hint": "Existing attachments stay in the bucket but stop loading in the app.",
  "storage_last_checked": "Last checked",
  "storage_cors_notice": "Cloudflare R2 needs a CORS rule allowing PUT from this app's origin before uploads will work.",
  "storage_error_auth": "Those credentials were rejected by the bucket.",
  "storage_error_unreachable": "Couldn't reach the bucket. Check the endpoint and bucket name.",
  "storage_error_config": "Server-side encryption isn't configured. Set USER_SECRET_ENCRYPTION_KEY.",
  "storage_error_forbidden": "Only owners and admins can change storage settings.",
  "storage_error_fallback": "Couldn't save the storage connection."
```

Add the `editor_` attachment keys in the existing `editor_` group:

```json
  "editor_attachment_upload_failed": "Upload failed",
  "editor_attachment_retry": "Retry",
  "editor_attachment_remove": "Remove",
  "editor_attachment_uploading": "Uploading…",
  "editor_attachment_too_large": "That file is larger than the 25 MB limit.",
  "editor_attachment_type_rejected": "That file type isn't allowed.",
  "editor_attachment_add": "Attach a file",
  "editor_attachment_download": "Download",
  "editor_attachment_unavailable": "This attachment couldn't be loaded."
```

- [ ] **Step 3: Record the new prefix in AGENTS.md**

In the i18n table in `AGENTS.md`, the `packages/frontend/messages/en/projects.json` row currently reads:

```
| `packages/frontend/messages/en/projects.json` | `org_`, `projects_`, `project_`, `members_`, `editor_` |
```

Change the prefix list to include `storage_`:

```
| `packages/frontend/messages/en/projects.json` | `org_`, `projects_`, `project_`, `members_`, `editor_`, `storage_` |
```

- [ ] **Step 4: Map the new errors**

In `packages/frontend/src/lib/errorMessage.ts`, add the five new tags to the `AppError` union (`StorageAuthInvalid`, `StorageConfigMissing`, `StorageError`, `AttachmentTooLarge`, `AttachmentTypeRejected`, `StorageNotConnected`, `AttachmentNotUploaded`) and add matching arms to the `Match.value` chain:

```ts
    Match.tag("StorageAuthInvalid", () => m.storage_error_auth()),
    Match.tag("StorageConfigMissing", () => m.storage_error_config()),
    Match.tag("StorageError", () => m.storage_error_unreachable()),
    Match.tag("StorageNotConnected", () => m.storage_error_unreachable()),
    Match.tag("AttachmentTooLarge", () => m.editor_attachment_too_large()),
    Match.tag("AttachmentTypeRejected", () =>
      m.editor_attachment_type_rejected()
    ),
    Match.tag("AttachmentNotUploaded", () =>
      m.editor_attachment_upload_failed()
    ),
```

- [ ] **Step 5: Write the settings route**

Create `packages/frontend/src/routes/_authed/orgs/$orgSlug/settings/storage.tsx`, following `settings/general.tsx` for the `Result.matchWithError` + form shape. Requirements:

- Read `orgStorageAtom(orgSlug)` and `orgDetailAtom(orgSlug)`; the form is editable only when `org.role` is `owner` or `admin`, otherwise render the read-only status plus `m.storage_error_forbidden()`.
- When `status === "not_connected"`, render the connect form: endpoint, bucket, region (default `auto`), access key id, secret access key (`type="password"`, `autoComplete="off"`), optional key prefix, and a path-style checkbox defaulting to checked.
- When `status === "active"`, render bucket/endpoint/region/masked key/last-checked as read-only rows, the `m.storage_cors_notice()` hint, and a disconnect control using the existing `ConfirmButton` shell (`packages/frontend/src/components` — check its API before wiring; it owns its own busy/error state).
- Submit disabled unless every required field is non-empty. While `connectState.waiting`, the submit button shows `m.storage_connecting()` — the connect round-trip really does take a second or two, so this label matters.
- Read `submitting` and `error` from the mutation atom's `Result`, per the global constraints — no mirroring into `useState`.
- On failure, render `errorMessage(error)` rather than a hardcoded string, so the auth-vs-unreachable distinction reaches the user.
- Never render the secret back. After a successful connect, clear the secret field from local state.
- Every button gets `active:scale-[0.97] transition-transform duration-100`.

- [ ] **Step 6: Add the rail entry**

In `packages/frontend/src/routes/_authed/orgs/$orgSlug/settings/route.tsx`, add a `storage` entry to `SECTIONS` between `members` and `danger`:

```ts
  {
    key: "storage",
    to: "/orgs/$orgSlug/settings/storage",
    label: m.storage_tab(),
    icon: HardDrive,
    heading: m.storage_heading(),
    description: m.storage_description()
  },
```

Import `HardDrive` from `lucide-react` and add `"/orgs/$orgSlug/settings/storage"` to the `to` union in the `satisfies` annotation below the array.

- [ ] **Step 7: Compile messages and run the frontend suite**

Run: `cd packages/frontend && bun run paraglide:compile && bun run test`
Expected: PASS — the existing 114 tests still pass. A missing message key fails the paraglide compile, which is the check that Step 2 is complete.

- [ ] **Step 8: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/frontend/src/atoms/storage.ts packages/frontend/src/routes/_authed/orgs/\$orgSlug/settings/storage.tsx packages/frontend/src/routes/_authed/orgs/\$orgSlug/settings/route.tsx packages/frontend/src/lib/errorMessage.ts packages/frontend/messages/en/projects.json AGENTS.md
git commit -m "feat(attachments): org storage settings tab"
```

---

### Task 11: Markdown rendering — the img override

Read-side rendering, independent of the editor. Splitting it out means attachments render correctly in the description view before the editor can create them.

**Files:**
- Modify: `packages/frontend/src/components/Markdown.tsx`
- Create: `packages/frontend/src/components/Markdown.test.tsx`

**Interfaces:**
- Consumes: `parseAttachmentUrl` (Task 1).
- Produces: `Markdown` renders `img` with lazy loading and a broken-image fallback; app-relative attachment URLs survive `urlTransform`.

- [ ] **Step 1: Write the failing test**

Create `packages/frontend/src/components/Markdown.test.tsx`. Check an existing frontend component test first (`packages/frontend/src/components/time/TimeControls.test.tsx`) for the render helper and setup this repo uses, and follow it:

```tsx
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { Markdown } from "./Markdown"

const ID = "01JBX7Q2K9ZWCVE8MTQ4RXPGHN"

describe("Markdown attachments", () => {
  it("renders an attachment image with a lazy loading hint", () => {
    render(<Markdown>{`![shot](/api/attachments/acme/${ID})`}</Markdown>)
    const img = screen.getByAltText("shot")
    expect(img.getAttribute("src")).toBe(`/api/attachments/acme/${ID}`)
    expect(img.getAttribute("loading")).toBe("lazy")
  })

  it("keeps an external image working", () => {
    render(<Markdown>{"![ext](https://example.test/a.png)"}</Markdown>)
    expect(screen.getByAltText("ext").getAttribute("src")).toBe(
      "https://example.test/a.png"
    )
  })

  it("still renders mention chips", () => {
    render(<Markdown>{"[T-1](mention:ticket/T-1)"}</Markdown>)
    expect(screen.getByText("T-1")).toBeDefined()
  })

  it("strips a javascript: image url", () => {
    render(<Markdown>{"![x](javascript:alert(1))"}</Markdown>)
    const src = screen.getByAltText("x").getAttribute("src") ?? ""
    expect(src.startsWith("javascript:")).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/frontend && bun run test Markdown`
Expected: FAIL — no `loading` attribute, because there is no `img` override yet.

- [ ] **Step 3: Add the img override**

In `packages/frontend/src/components/Markdown.tsx`:

1. Extend `allowMentionUrls` so app-relative attachment URLs pass through untouched. `defaultUrlTransform` already allows root-relative paths, so verify with the test rather than assuming — if the test shows the src stripped, add the passthrough explicitly:

```ts
const allowMentionUrls = (url: string) => {
  if (url.startsWith("mention:")) return url
  if (parseAttachmentUrl(url)) return url
  return defaultUrlTransform(url)
}
```

2. Add an `img` entry to the `components` map:

```tsx
          img: ({ src, alt, ...rest }) => (
            <img
              src={typeof src === "string" ? src : undefined}
              alt={alt ?? ""}
              loading="lazy"
              decoding="async"
              className="my-2 max-w-full rounded-lg border"
              {...rest}
            />
          )
```

Keep the `javascript:` guard intact — that is `urlTransform`'s job, so do not bypass it for non-attachment URLs.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/frontend && bun run test Markdown`
Expected: PASS — 4 tests.

- [ ] **Step 5: Run the frontend suite, typecheck, lint**

Run: `cd packages/frontend && bun run test && cd ../.. && bun run typecheck && bun run lint`
Expected: PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components/Markdown.tsx packages/frontend/src/components/Markdown.test.tsx
git commit -m "feat(attachments): render attachment images in markdown"
```

---

### Task 12: Lexical attachment node and markdown transformer

The editor's representation. Lexical has no image node at all, and the default transformers would flatten `![alt](url)` into a plain link, losing the image on every save — so the transformer is what makes descriptions round-trip.

**Files:**
- Create: `packages/frontend/src/components/Lexical/AttachmentNode.tsx`
- Create: `packages/frontend/src/components/Lexical/attachmentTransformer.ts`
- Create: `packages/frontend/src/components/Lexical/attachmentTransformer.test.ts`
- Create: `packages/frontend/src/components/Lexical/AttachmentExtension.ts`

**Interfaces:**
- Consumes: `parseAttachmentUrl`, `attachmentUrl` (Task 1); Lexical 0.44 `DecoratorNode` API.
- Produces:
  - `$createAttachmentNode(payload: { url: string; alt: string; filename: string; kind: "image" | "file"; uploadId?: string; progress?: number; failed?: boolean }): AttachmentNode`
  - `$isAttachmentNode(node: LexicalNode | null | undefined): node is AttachmentNode`
  - `AttachmentNode` getters, used by the transformer and the plugin: `getUrl(): string`, `getAlt(): string`, `getFilename(): string`, `getKind(): "image" | "file"`, `getUploadId(): string | undefined`, `getProgress(): number`, `getFailed(): boolean`
  - `AttachmentNode` setters, used by the plugin inside `editor.update(...)`: `setProgress(fraction: number): void`, `setFailed(failed: boolean): void`, `setCommitted(url: string): void` (clears `uploadId`, sets `url`, clears `failed`)
  - `ATTACHMENT_MARKDOWN_RE: RegExp`
  - `formatAttachmentMarkdown(input: { kind: "image" | "file"; alt: string; url: string }): string`
  - `ATTACHMENT_TRANSFORMER: ElementTransformer`
  - `AttachmentExtension`

- [ ] **Step 1: Write the failing test**

Create `packages/frontend/src/components/Lexical/attachmentTransformer.test.ts`. Model it on the existing `horizontalRuleTransformer.test.ts` — read that file first for how this repo tests a transformer without mounting an editor:

```ts
import { describe, expect, it } from "vitest"
import { ATTACHMENT_MARKDOWN_RE, formatAttachmentMarkdown } from "./attachmentTransformer"

const ID = "01JBX7Q2K9ZWCVE8MTQ4RXPGHN"
const URL = `/api/attachments/acme/${ID}`

describe("ATTACHMENT_MARKDOWN_RE", () => {
  it("matches an image attachment", () => {
    const match = `![shot](${URL})`.match(ATTACHMENT_MARKDOWN_RE)
    expect(match).not.toBeNull()
    expect(match![1]).toBe("!")
    expect(match![2]).toBe("shot")
    expect(match![3]).toBe(URL)
  })

  it("matches a file attachment link", () => {
    const match = `[report.pdf](${URL})`.match(ATTACHMENT_MARKDOWN_RE)
    expect(match).not.toBeNull()
    expect(match![1]).toBe("")
    expect(match![2]).toBe("report.pdf")
  })

  it("does not match an external image", () => {
    expect("![x](https://example.test/a.png)".match(ATTACHMENT_MARKDOWN_RE))
      .toBeNull()
  })

  it("does not match a mention link", () => {
    expect("[T-1](mention:ticket/T-1)".match(ATTACHMENT_MARKDOWN_RE)).toBeNull()
  })
})

describe("formatAttachmentMarkdown", () => {
  it("writes an image as a bang link", () => {
    expect(
      formatAttachmentMarkdown({ kind: "image", alt: "shot", url: URL })
    ).toBe(`![shot](${URL})`)
  })

  it("writes a file as a plain link", () => {
    expect(
      formatAttachmentMarkdown({ kind: "file", alt: "report.pdf", url: URL })
    ).toBe(`[report.pdf](${URL})`)
  })

  it("escapes a bracket in the alt text", () => {
    expect(
      formatAttachmentMarkdown({ kind: "image", alt: "a[b]c", url: URL })
    ).toBe(`![a\\[b\\]c](${URL})`)
  })

  it("round-trips through the regex", () => {
    const md = formatAttachmentMarkdown({
      kind: "image",
      alt: "shot",
      url: URL
    })
    expect(md.match(ATTACHMENT_MARKDOWN_RE)![3]).toBe(URL)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/frontend && bun run test attachmentTransformer`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the decorator node**

Create `packages/frontend/src/components/Lexical/AttachmentNode.tsx`. Read `MentionNode.tsx` first — it is this repo's existing custom-node example and establishes the serialization and `importJSON`/`exportJSON` conventions to follow. The node must:

- Extend `DecoratorNode<JSX.Element>` with `getType()` returning `"attachment"`.
- Carry `__url`, `__alt`, `__filename`, `__kind` (`"image" | "file"`), `__uploadId` (`string | undefined`, set only while an upload is in flight), `__progress` (`number`, 0–1, meaningful only while `__uploadId` is set) and `__failed` (`boolean`).
- Implement `static clone`, `static importJSON`, `exportJSON`, `createDOM` (a `span` with `display: block` so a block-level image doesn't nest inside a paragraph awkwardly), `updateDOM` returning `false`, and `isInline()` returning `false`.
- `decorate()` renders one of four states:
  - `uploadId` set and not failed — a placeholder using `m.editor_attachment_uploading()` with a determinate progress bar driven by `__progress`, sized to match the eventual image so the layout doesn't jump on swap.
  - `failed` — `m.editor_attachment_upload_failed()` plus a retry button (`m.editor_attachment_retry()`) and a remove button (`m.editor_attachment_remove()`).
  - `kind: "image"`, committed — `<img src={__url} alt={__alt} loading="lazy" className="my-2 max-w-full rounded-lg border" />`, with an `onError` that swaps to `m.editor_attachment_unavailable()` so a dead attachment doesn't render as a broken-image glyph.
  - `kind: "file"`, committed — a chip with the filename and a download affordance labelled `m.editor_attachment_download()`.
- Buttons inside `decorate()` still obey the press-feel rule: `active:scale-[0.97] transition-transform duration-100`.
- Export `$createAttachmentNode` and `$isAttachmentNode`.

- [ ] **Step 4: Write the transformer**

Create `packages/frontend/src/components/Lexical/attachmentTransformer.ts`:

```ts
import type { ElementTransformer } from "@lexical/markdown"
import { parseAttachmentUrl } from "@projectproject/shared"
import {
  $createAttachmentNode,
  $isAttachmentNode,
  AttachmentNode
} from "./AttachmentNode"

export const ATTACHMENT_MARKDOWN_RE =
  /^(!?)\[([^\]]*)\]\((\/api\/attachments\/[^)\s]+)\)\s*$/

export const formatAttachmentMarkdown = (input: {
  readonly kind: "image" | "file"
  readonly alt: string
  readonly url: string
}): string => {
  const alt = input.alt.replace(/([[\]])/g, "\\$1")
  return `${input.kind === "image" ? "!" : ""}[${alt}](${input.url})`
}

export const ATTACHMENT_TRANSFORMER: ElementTransformer = {
  dependencies: [AttachmentNode],
  export: (node) => {
    if (!$isAttachmentNode(node)) return null
    if (node.getUploadId() !== undefined || node.getFailed()) return ""
    return formatAttachmentMarkdown({
      kind: node.getKind(),
      alt: node.getAlt(),
      url: node.getUrl()
    })
  },
  regExp: ATTACHMENT_MARKDOWN_RE,
  replace: (parentNode, _children, match) => {
    const [, bang, alt, url] = match
    if (!url || !parseAttachmentUrl(url)) return false
    const node = $createAttachmentNode({
      url,
      alt: alt ?? "",
      filename: alt ?? "",
      kind: bang === "!" ? "image" : "file"
    })
    parentNode.replace(node)
    return true
  },
  type: "element"
}
```

The `export` returning `""` for an in-flight or failed upload is what keeps a placeholder out of the saved markdown — the description must never reference an object that isn't committed. This matters more than it looks: the editor autosaves on a 600ms debounce, so a description **will** be serialized while an upload is still running.

- [ ] **Step 5: Write the extension**

Create `packages/frontend/src/components/Lexical/AttachmentExtension.ts`, following `MentionExtension.ts`:

```ts
import { defineExtension } from "lexical"
import { AttachmentNode } from "./AttachmentNode"

export const AttachmentExtension = defineExtension({
  name: "@projectproject/attachment",
  nodes: [AttachmentNode]
})
```

Verify the property name against `MentionExtension.ts` — Lexical 0.44's extension API is what that file already uses, so copy its shape rather than the docs'.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/frontend && bun run test attachmentTransformer`
Expected: PASS — 8 tests.

- [ ] **Step 7: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/frontend/src/components/Lexical/AttachmentNode.tsx packages/frontend/src/components/Lexical/attachmentTransformer.ts packages/frontend/src/components/Lexical/attachmentTransformer.test.ts packages/frontend/src/components/Lexical/AttachmentExtension.ts
git commit -m "feat(attachments): lexical attachment node and markdown transformer"
```

---

### Task 13: Upload orchestration and editor wiring

The last mile: paste, drop, pick, upload, swap the placeholder for the real node. Opt-in so the five non-description `LexicalEditor` callsites are untouched.

**Files:**
- Create: `packages/frontend/src/atoms/attachments.ts`
- Create: `packages/frontend/src/components/Lexical/AttachmentsPlugin.tsx`
- Modify: `packages/frontend/src/components/LexicalEditor.tsx`
- Modify: `packages/frontend/src/components/TicketPage/DescriptionField.tsx`

**Interfaces:**
- Consumes: `client.attachments.prepare` / `commit` (Task 8); `$createAttachmentNode`, `$isAttachmentNode`, `AttachmentExtension`, `ATTACHMENT_TRANSFORMER` (Task 12); `orgStorageAtom` (Task 10); allowlist helpers (Task 1).
- Produces:
  - `uploadAttachmentAtom` — family-keyed by `ticketKey(orgSlug, slug, id)`, runs prepare → PUT → commit.
  - `AttachmentsPlugin` — Lexical plugin component.
  - `LexicalEditorProps.attachments?: { orgSlug: string; slug: string; ticketId: string }`.

- [ ] **Step 1: Write the upload atom**

Create `packages/frontend/src/atoms/attachments.ts`. This is a plain `runtime.fn`, not optimistic — the editor owns the placeholder, so there is no server-derived list to mirror:

```ts
import { Atom } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import { splitTicketKey } from "./tickets"

export interface UploadAttachmentInput {
  readonly file: File
  readonly onProgress?: (fraction: number) => void
}

export interface UploadedAttachment {
  readonly id: string
  readonly url: string
  readonly filename: string
  readonly contentType: string
}

export const uploadAttachmentAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id } = splitTicketKey(key)
  return runtime.fn(
    Effect.fn(function* (input: UploadAttachmentInput) {
      const client = yield* ApiClient
      const prepared = yield* client.attachments.prepare({
        path: { orgSlug, slug, id },
        payload: {
          filename: input.file.name,
          contentType: input.file.type,
          byteSize: input.file.size
        }
      })

      yield* Effect.async<void, Error>((resume) => {
        const xhr = new XMLHttpRequest()
        xhr.open("PUT", prepared.uploadUrl, true)
        xhr.setRequestHeader("content-type", input.file.type)
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            input.onProgress?.(event.loaded / event.total)
          }
        }
        xhr.onload = () =>
          resume(
            xhr.status >= 200 && xhr.status < 300
              ? Effect.void
              : Effect.fail(new Error(`upload failed with ${xhr.status}`))
          )
        xhr.onerror = () => resume(Effect.fail(new Error("upload failed")))
        xhr.onabort = () => resume(Effect.fail(new Error("upload aborted")))
        xhr.send(input.file)
        return Effect.sync(() => xhr.abort())
      })

      const committed = yield* client.attachments.commit({
        path: { orgSlug, slug, id, attachmentId: prepared.id }
      })

      return {
        id: committed.id,
        url: committed.url,
        filename: committed.filename,
        contentType: committed.contentType
      } satisfies UploadedAttachment
    })
  )
})
```

Confirm `splitTicketKey` is exported from `@/atoms/tickets`; if it is private there, export it rather than duplicating the parser.

Two things about that upload call:

- It uses `XMLHttpRequest`, not `fetch`, specifically because `fetch` cannot report **upload** progress — there is no request-side equivalent of a streaming response body in any shipping browser. The ticket asks for upload progress, so XHR is the only option. Returning `Effect.sync(() => xhr.abort())` from `Effect.async` wires interruption to a real cancel, so unmounting the editor aborts an in-flight upload instead of leaking it.
- The presigned `PUT` must **not** carry credentials — do not set `withCredentials`. The URL is already signed, and sending cookies to the bucket origin would be both useless and leaky.

- [ ] **Step 2: Write the plugin**

Create `packages/frontend/src/components/Lexical/AttachmentsPlugin.tsx`. It takes `{ orgSlug, slug, ticketId }`, calls `useLexicalComposerContext()`, and:

- Registers a `PASTE_COMMAND` handler reading `event.clipboardData.files`, and a `DROP_COMMAND` / `DRAGOVER_COMMAND` pair reading `event.dataTransfer.files`. Both must `preventDefault()` only when at least one file is present, so pasting text still behaves.
- For each file: check `isAllowedAttachmentContentType(file.type)` and `file.size <= ATTACHMENT_MAX_BYTES` **client-side first** and surface `m.editor_attachment_type_rejected()` / `m.editor_attachment_too_large()` without a round-trip. The server re-checks; this is a courtesy, not the enforcement point.
- Insert an `AttachmentNode` with a local `uploadId` (a `crypto.randomUUID()`) and `kind` derived from `isRasterImageContentType(file.type)`.
- Call the upload atom, passing `onProgress` so the placeholder node can render a determinate progress fraction. On success, find the node by `uploadId` inside `editor.update(...)` and replace it with a committed node (`uploadId: undefined`, real `url`). On failure, mark the node failed so it renders `m.editor_attachment_upload_failed()` with a retry affordance that re-runs the same upload for the same file.
- Also render a file-picker affordance — a button labelled `m.editor_attachment_add()` that opens a hidden `<input type="file" multiple accept={ATTACHMENT_CONTENT_TYPES.join(",")} />` and feeds its `files` through the identical code path as paste and drop. All three entry points must share one `handleFiles(files: FileList)` function; do not write the validate-insert-upload sequence three times.
- On unmount, ignore in-flight results rather than touching a torn-down editor.

Use `editor.registerCommand(...)` with `COMMAND_PRIORITY_LOW` and return the unregister function from `useEffect`, matching `MentionsPlugin.tsx`.

- [ ] **Step 3: Make attachments opt-in on the editor**

In `packages/frontend/src/components/LexicalEditor.tsx`:

1. Add to `LexicalEditorProps`:

```ts
  attachments?: {
    readonly orgSlug: string
    readonly slug: string
    readonly ticketId: string
  }
```

2. Destructure `attachments` in the component signature.
3. The `defineExtension` call is inside a `useState` initializer, so it captures its inputs once. Capture `attachments !== undefined` the same way the existing code captures `initialAutoFocus`, and conditionally include `AttachmentExtension` in `dependencies`. Do not read `attachments` directly inside the initializer beyond that boolean.
4. `MARKDOWN_TRANSFORMERS` is module-level and shared by every callsite. Adding `ATTACHMENT_TRANSFORMER` there unconditionally would let comments import attachment markdown — which is out of scope but harmless on read, and actively wrong on write. Build the transformer list per-editor instead:

```ts
const transformersFor = (withAttachments: boolean) =>
  withAttachments
    ? [ATTACHMENT_TRANSFORMER, ...MARKDOWN_TRANSFORMERS]
    : MARKDOWN_TRANSFORMERS
```

and thread the result through both `$convertFromMarkdownString` in the initializer and `$convertToMarkdownString` wherever the editor serializes. Grep for both calls — there is one of each in this file plus the `MarkdownShortcutPlugin` usage.

5. Render `{attachments ? <AttachmentsPlugin {...attachments} /> : null}` alongside `<MentionsPlugin />`.

Keep `MARKDOWN_TRANSFORMERS` exported unchanged — `LexicalEditor.test.ts` imports it.

- [ ] **Step 4: Pass the prop from the description field**

In `packages/frontend/src/components/TicketPage/DescriptionField.tsx` at the `<LexicalEditor` callsite (line ~102), add:

```tsx
              attachments={{ orgSlug, slug, ticketId: id }}
```

Read the component to find how it already receives `orgSlug`, `slug` and the ticket id — pass those through rather than re-deriving them from the router.

Gate the affordance on a connected bucket: read `orgStorageAtom(orgSlug)` and pass `attachments` only when `status === "active"`. When no bucket is connected the editor gets no attachment support at all, which is the "hidden, not broken" requirement.

The ticket also asks that owners and admins get a pointer rather than silence. So when `status !== "active"`, render — below the editor, not inside it — a one-line hint that is role-conditional: for `owner`/`admin` (read `orgDetailAtom(orgSlug)` for the role, as `settings/general.tsx` does) a `<Link to="/orgs/$orgSlug/settings/storage">` labelled `m.editor_attachment_connect_prompt()`; for a plain member, render nothing at all. Add that message key to `packages/frontend/messages/en/projects.json` in the `editor_` group:

```json
  "editor_attachment_connect_prompt": "Connect object storage to attach files to tickets."
```

- [ ] **Step 5: Run the frontend suite**

Run: `cd packages/frontend && bun run test`
Expected: PASS — including the existing `LexicalEditor.test.ts`, which is the regression guard that the five other callsites still serialize markdown identically.

- [ ] **Step 6: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/atoms/attachments.ts packages/frontend/src/components/Lexical/AttachmentsPlugin.tsx packages/frontend/src/components/LexicalEditor.tsx packages/frontend/src/components/TicketPage/DescriptionField.tsx
git commit -m "feat(attachments): paste, drop and upload attachments in ticket descriptions"
```

---

### Task 14: Full verification

**Files:** none created or modified unless a check fails.

- [ ] **Step 1: Full test suite**

Run: `bun run test`
Expected: all three packages pass. Baseline was 469 passing / 4 skipped; this plan adds roughly 60 tests, so expect ~530 passing and 0 failures.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint and format**

Run: `bun run lint && bun run format:check`
Expected: clean. If `format:check` complains, run `bun run format` and commit the result.

- [ ] **Step 4: Boot the stack**

Run: `bun run dev:db && docker compose up -d minio`, then `bun run dev`.
Expected: backend and frontend both start with no layer-construction errors and no unhandled defects in the log.

- [ ] **Step 5: Confirm the routes answer**

```bash
curl -s -o /dev/null -w "storage:%{http_code}\n" http://localhost:3000/api/orgs/project-project/storage
curl -s -o /dev/null -w "serve:%{http_code}\n" http://localhost:3000/api/attachments/project-project/01JBX7Q2K9ZWCVE8MTQ4RXPGHN
curl -s http://localhost:3000/api/docs/swagger.json | grep -c attachments
```

Expected: `401`, `401`, and a non-zero count proving the group reached the OpenAPI spec.

- [ ] **Step 6: Report for the human smoke test**

Summarize for Wouter: what to type into the Storage form for MinIO (endpoint `http://localhost:9000`, region `us-east-1`, key `projectproject`, secret `projectproject_dev`, path-style on), that the bucket must exist first via the MinIO console at `http://localhost:9001`, and that R2 additionally needs a CORS rule allowing `PUT` from the app origin. Then hand off: connect a real R2 bucket, paste a screenshot into a ticket description, reload, and confirm it renders.

Do **not** mark this task complete by asserting the end-to-end path works — it has not been exercised against a real bucket. Report exactly what was and was not verified.
