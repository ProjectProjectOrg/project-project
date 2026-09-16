# Custom Project Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a project's icon be an uploaded image — as a background-removed sticker or a cropped full-bleed image — while the existing emoji remains as a runtime fallback.

**Architecture:** Icons reuse the project image infrastructure T-158 landed for banners: the slot-keyed `project_image_reference` table, the null-ticket `prepareProject`/`commitProject` upload endpoints, and the frontmatter-plus-`jsonb`-mirror pattern in `ProjectDocs`. Icons add two slots, `icon` and `icon_source`. All image processing happens in the browser with a deterministic corner flood fill — no model, no new runtime dependency.

**Tech Stack:** Effect v4 (`Schema`, `Effect.gen`, `Context.Service`), Drizzle ORM + Postgres, TanStack Start/Router, `@effect/atom-react`, shadcn/Radix + Fluid Functionalism components, Tailwind v4, paraglide i18n, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-10-T-136-project-icons-design.md`

## Global Constraints

- **No comments.** Zero inline comments by default; a single short line only when a value would actively mislead. Never multi-line comment blocks or rationale prose — that goes in the commit message.
- **All user-facing strings go through paraglide** (`m.*` from `@/paraglide/messages`). Raw literals in JSX are forbidden. New project-domain keys use the `project_` prefix and live in `packages/frontend/messages/en/projects.json`, grouped by prefix then alphabetical.
- **Press feel:** every clickable button gets `active:scale-[0.97]` with `transition-transform duration-100` (or `active:[&>span]:scale-[0.97]` for icon buttons).
- **Hover feel:** pair every hover class with a matching `transition-*` utility, e.g. `transition-colors hover:bg-accent`, never bare `hover:bg-accent`.
- **Prefer component variants over local styling.** Extend the primitive rather than rolling one-off Tailwind at a callsite.
- **Mutations are family-keyed and optimistic by default**, using `Atom.optimistic` / `Atom.optimisticFn` keyed by `projectKey(orgSlug, slug)`.
- **Feather is a constant of 1.** Never exposed, never persisted.
- **Tolerance range is 0–160, default 24.** Integer.
- **Live preview analyses at 256px.** Apply re-analyses once at 512px (`CUTOUT_APPLY_MAX_EDGE`), not at the source resolution.
- **No new npm dependencies.** The cutout is hand-written; the slider already exists at `@/components/ui/slider`.
- Run `bun run test`, `bun run typecheck`, and `bun run format` before each commit.

---

## File Structure

**Created:**
- `packages/frontend/src/lib/iconCutout.ts` — the production cutout module: alpha detection, corner check, flood fill, feather. Pure, no DOM types beyond `Uint8ClampedArray`. Promoted from the spike's `src/dev/icon-cutout/cutout.ts`.
- `packages/frontend/src/lib/iconCutout.test.ts` — unit tests over synthetic pixel buffers.
- `packages/frontend/src/components/ProjectIconDisplay.tsx` — the single render component deciding emoji vs sticker vs full-bleed, including the contrast-aware outline and the load-failure fallback.
- `packages/frontend/src/components/ProjectIconDisplay.test.tsx`
- `packages/frontend/src/components/ProjectIconUpload.tsx` — the upload + preview + tolerance editor surface.
- `packages/backend/src/db/migrations/<generated>/migration.sql` — adds `project_index.icon_image`.

**Modified:**
- `packages/shared/src/schemas/Project.ts` — add `ProjectIconCrop`, `ProjectIconImage`, `iconImage` on `Project` and `UpdateProjectInput`.
- `packages/backend/src/db/schema.ts` — add the `iconImage` jsonb column.
- `packages/backend/src/Services/ProjectDocs.ts` — add `iconImage` to the document shapes.
- `packages/backend/src/Layers/ProjectDocs.ts` — frontmatter encode/decode.
- `packages/backend/src/Layers/Projects.ts` — slot writes and `iconImage` on every project read.
- `packages/frontend/src/components/ProjectIdentityEditor.tsx` — mount the upload surface beside the emoji picker.
- `packages/frontend/src/components/ProjectTile.tsx`, `packages/frontend/src/routes/_authed/route.tsx` — render via `ProjectIconDisplay`.
- `packages/frontend/messages/en/projects.json` — new `project_icon_*` keys.

**Deleted (final task):**
- `packages/frontend/src/routes/dev.icon-cutout.tsx`, `packages/frontend/src/dev/`, `tools/icon-cutout/`.

---

### Task 1: Shared schema for `iconImage`

**Files:**
- Modify: `packages/shared/src/schemas/Project.ts`
- Test: `packages/shared/src/schemas/Project.test.ts`

**Interfaces:**
- Consumes: `AttachmentId` from `./Attachment`, `ProjectBannerCrop` (already defined in this file).
- Produces: `ProjectIconCrop`, `ProjectIconImage` (a two-member tagged union on `type`), and `iconImage: Schema.NullOr(ProjectIconImage)` on `Project`, `Schema.optional(Schema.NullOr(ProjectIconImage))` on `UpdateProjectInput`.

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/schemas/Project.test.ts`:

```ts
describe("ProjectIconImage", () => {
  const decode = Schema.decodeUnknownSync(ProjectIconImage)

  it("decodes a sticker with a tolerance", () => {
    const value = decode({
      type: "sticker",
      sourceAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
      renderedAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M3",
      cutoutTolerance: 24,
      crop: { x: 0.5, y: 0.5, zoom: 1 }
    })
    expect(value.type).toBe("sticker")
  })

  it("decodes a sticker with a null tolerance for transparent sources", () => {
    const value = decode({
      type: "sticker",
      sourceAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
      renderedAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M3",
      cutoutTolerance: null,
      crop: { x: 0.5, y: 0.5, zoom: 1 }
    })
    expect(value.type).toBe("sticker")
  })

  it("decodes full_bleed without a rendered attachment", () => {
    const value = decode({
      type: "full_bleed",
      sourceAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
      crop: { x: 0.2, y: 0.8, zoom: 2 }
    })
    expect(value.type).toBe("full_bleed")
  })

  it("rejects a tolerance above 160", () => {
    expect(() =>
      decode({
        type: "sticker",
        sourceAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
        renderedAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M3",
        cutoutTolerance: 161,
        crop: { x: 0.5, y: 0.5, zoom: 1 }
      })
    ).toThrow()
  })
})
```

Add `ProjectIconImage` to the existing import from `./Project` at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test --project shared -t ProjectIconImage`
Expected: FAIL — `ProjectIconImage` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `packages/shared/src/schemas/Project.ts`, after the existing `ProjectBanner` block:

```ts
export const ProjectIconCrop = ProjectBannerCrop

export const ProjectIconTolerance = Schema.Int.pipe(
  Schema.check(Schema.isBetween({ minimum: 0, maximum: 160 }))
)

export const ProjectIconImage = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("sticker"),
    sourceAttachmentId: AttachmentId,
    renderedAttachmentId: AttachmentId,
    cutoutTolerance: Schema.NullOr(ProjectIconTolerance),
    crop: ProjectIconCrop
  }),
  Schema.Struct({
    type: Schema.Literal("full_bleed"),
    sourceAttachmentId: AttachmentId,
    crop: ProjectIconCrop
  })
])
export type ProjectIconImage = typeof ProjectIconImage.Type
```

`ProjectBannerCrop` is currently declared without `export`; add `export` to it.

Add to the `Project` struct, immediately after `banner`:

```ts
  iconImage: Schema.NullOr(ProjectIconImage),
```

Add to `UpdateProjectInput`, immediately after `banner`:

```ts
  iconImage: Schema.optional(Schema.NullOr(ProjectIconImage)),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test --project shared -t ProjectIconImage`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify nothing else broke**

Run: `bun run test && bun run typecheck`
Expected: all suites pass. Backend and frontend construct `Project` values in several places and will now fail to typecheck for a missing `iconImage`; add `iconImage: null` at each site the compiler flags. These are the same call sites that already pass `banner`.

- [ ] **Step 6: Commit**

```bash
git add packages/shared packages/backend packages/frontend
git commit -m "feat(icons): add the iconImage schema (T-136)"
```

---

### Task 2: Persist `iconImage` through frontmatter and the index

**Files:**
- Modify: `packages/backend/src/db/schema.ts`
- Modify: `packages/backend/src/Services/ProjectDocs.ts`
- Modify: `packages/backend/src/Layers/ProjectDocs.ts`
- Modify: `packages/backend/src/Layers/Projects.ts`
- Create: `packages/backend/src/db/migrations/<generated>/migration.sql`
- Test: `packages/backend/src/Layers/ProjectDocs.test.ts`

**Interfaces:**
- Consumes: `ProjectIconImage` from Task 1; `replaceProjectImageReference` from `packages/backend/src/projectImageReferences.ts`.
- Produces: `iconImage` readable on every project returned by `Projects`, and writable through `updateProject`.

- [ ] **Step 1: Write the failing test**

Append to `packages/backend/src/Layers/ProjectDocs.test.ts`, following the shape of the existing banner round-trip test:

```ts
it("round-trips iconImage through frontmatter", () =>
  Effect.gen(function* () {
    const docs = yield* ProjectDocs
    yield* docs.write("acme", {
      ...baseDocument,
      iconImage: {
        type: "sticker",
        sourceAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
        renderedAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M3",
        cutoutTolerance: 24,
        crop: { x: 0.5, y: 0.5, zoom: 1 }
      }
    })
    const read = yield* docs.read("acme", baseDocument.slug)
    expect(read.iconImage).toEqual({
      type: "sticker",
      sourceAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
      renderedAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M3",
      cutoutTolerance: 24,
      crop: { x: 0.5, y: 0.5, zoom: 1 }
    })
  }).pipe(Effect.provide(TestLayer), Effect.runPromise))

it("defaults iconImage to null when absent from frontmatter", () =>
  Effect.gen(function* () {
    const docs = yield* ProjectDocs
    yield* docs.write("acme", baseDocument)
    const read = yield* docs.read("acme", baseDocument.slug)
    expect(read.iconImage).toBeNull()
  }).pipe(Effect.provide(TestLayer), Effect.runPromise))
```

Reuse whatever the file already names its fixture document and test layer; `baseDocument` and `TestLayer` above are placeholders for those existing names.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test --project backend -t iconImage`
Expected: FAIL — `iconImage` is not a property of the document type.

- [ ] **Step 3: Add the column to the Drizzle schema**

In `packages/backend/src/db/schema.ts`, in `projectIndex`, immediately after the `banner` column:

```ts
    iconImage: jsonb("icon_image").$type<ProjectIconImage>(),
```

Add `ProjectIconImage` to the existing type-only import from `@projectproject/shared` at the top of the file.

- [ ] **Step 4: Generate and apply the migration**

Run:

```bash
cd packages/backend && bun run db:generate && bun run db:migrate
```

Expected: a new directory under `src/db/migrations/` whose `migration.sql` contains `ALTER TABLE "project_index" ADD COLUMN "icon_image" jsonb;`. The column is nullable with no default, so existing rows need no backfill.

- [ ] **Step 5: Thread it through the document types**

In `packages/backend/src/Services/ProjectDocs.ts`, add to both interfaces that already carry `banner` (the read shape and the write shape):

```ts
  readonly iconImage?: ProjectIconImage | null
```

In `packages/backend/src/Layers/ProjectDocs.ts`, add to `ProjectFrontmatter` beside `banner`:

```ts
  iconImage: Schema.NullOr(ProjectIconImage).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
```

and in `toFrontmatter`, beside the `banner` line:

```ts
    iconImage: document.iconImage ?? null,
```

Import `ProjectIconImage` from `@projectproject/shared` in both files.

- [ ] **Step 6: Run test to verify it passes**

Run: `bun run test --project backend -t iconImage`
Expected: PASS, 2 tests.

- [ ] **Step 7: Return `iconImage` from every project read**

In `packages/backend/src/Layers/Projects.ts`, every place that already maps `banner:` into a returned project (around lines 421, 452, 782, 817, 908, 948, 961, 1011, 1023 — let the compiler find them after Task 1) gains the sibling `iconImage:` line, sourced the same way `banner` is at that site — from `indexRow.iconImage`, `file.iconImage ?? null`, or `r.iconImage` respectively.

- [ ] **Step 8: Write the slot writes in `updateProject`**

In the `updateProject` handler, directly after the existing `nextBanner` block:

```ts
const nextIconImage =
  input.iconImage === undefined
    ? (file.iconImage ?? null)
    : input.iconImage
if (input.iconImage !== undefined) {
  yield* replaceProjectImageReference(db, {
    orgSlug,
    projectSlug: slug,
    slot: "icon",
    attachmentId:
      nextIconImage?.type === "sticker"
        ? nextIconImage.renderedAttachmentId
        : null
  })
  yield* replaceProjectImageReference(db, {
    orgSlug,
    projectSlug: slug,
    slot: "icon_source",
    attachmentId: nextIconImage?.sourceAttachmentId ?? null
  })
}
```

and beside `if (input.banner !== undefined) dbPatch.banner = nextBanner`:

```ts
if (input.iconImage !== undefined) dbPatch.iconImage = nextIconImage
```

Both `replaceProjectImageReference` calls must run inside the same transaction that already wraps the banner call, so a half-written icon cannot survive a failure. Follow the existing `db` handle in scope; do not open a second transaction.

- [ ] **Step 9: Write the slot test**

Append to `packages/backend/src/Layers/Projects.test.ts`:

```ts
it("writes both icon slots and orphans the previous rendered image", () =>
  Effect.gen(function* () {
    const projects = yield* Projects
    yield* projects.update("acme", "site", {
      iconImage: {
        type: "sticker",
        sourceAttachmentId: sourceA,
        renderedAttachmentId: renderedA,
        cutoutTolerance: 24,
        crop: { x: 0.5, y: 0.5, zoom: 1 }
      }
    })
    yield* projects.update("acme", "site", {
      iconImage: {
        type: "sticker",
        sourceAttachmentId: sourceB,
        renderedAttachmentId: renderedB,
        cutoutTolerance: 40,
        crop: { x: 0.5, y: 0.5, zoom: 1 }
      }
    })
    const db = yield* Db
    const rows = yield* db
      .select()
      .from(projectImageReference)
      .where(eq(projectImageReference.projectSlug, "site"))
    const slots = Object.fromEntries(
      rows.map((row) => [row.slot, row.attachmentId])
    )
    expect(slots.icon).toBe(renderedB)
    expect(slots.icon_source).toBe(sourceB)

    const orphaned = yield* db
      .select()
      .from(attachmentIndex)
      .where(eq(attachmentIndex.id, renderedA))
    expect(orphaned[0].status).toBe("orphaned")
  }).pipe(Effect.provide(TestLayer), Effect.runPromise))
```

Create the four attachments with the file's existing committed-attachment helper before updating.

- [ ] **Step 10: Confirm the upload endpoints enforce project write access**

`prepareProject` and `commitProject` are separate endpoints from `updateProject`, so they need their own check. Read `packages/backend/src/handlers/attachments.ts` and follow `Attachments.prepare` / `Attachments.commit` into `packages/backend/src/Layers/Attachments.ts` to find which authorisation they apply.

Add to `packages/backend/src/Layers/Attachments.test.ts`:

```ts
it("refuses a project attachment upload from a non-member", () =>
  Effect.gen(function* () {
    const attachments = yield* Attachments
    const result = yield* attachments
      .prepare("acme", "site", null, outsiderUserId, {
        filename: "icon.png",
        contentType: "image/png",
        byteSize: 1024
      })
      .pipe(Effect.either)
    expect(Either.isLeft(result)).toBe(true)
  }).pipe(Effect.provide(TestLayer), Effect.runPromise))
```

Use the file's existing helper for a user who is not a member of the org.

If the test passes immediately, the check already exists and nothing more is needed. If it fails, add the same project write check `updateProject` uses to both `prepare` and `commit` on the null-ticket path, then re-run.

- [ ] **Step 11: Run the backend suite**

Run: `bun run test --project backend && bun run typecheck`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add packages/backend
git commit -m "feat(icons): persist iconImage and write its image slots (T-136)"
```

---

### Task 3: The cutout module

**Files:**
- Create: `packages/frontend/src/lib/iconCutout.ts`
- Create: `packages/frontend/src/lib/iconCutout.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `analyzeCutout(image: RgbaImage, params: { tolerance: number }): CutoutResult`
  - `hasAlpha(image: RgbaImage): boolean`
  - `CUTOUT_FEATHER = 1`, `CUTOUT_DEFAULT_TOLERANCE = 24`, `CUTOUT_MAX_TOLERANCE = 160`, `CUTOUT_PREVIEW_EDGE = 256`
  - `interface RgbaImage { data: Uint8ClampedArray; width: number; height: number }`
  - `interface CutoutResult { alpha: Uint8ClampedArray; clean: boolean; checks: ReadonlyArray<CutoutCheck> }`
  - `interface CutoutCheck { id: string; passed: boolean }`

Start from the spike module at `packages/frontend/src/dev/icon-cutout/cutout.ts`, which is already correct for the global-mode path. Port it with three changes: drop the `mode` parameter and the region-growing branch entirely, drop the `borderRetained` check, and add `hasAlpha`.

- [ ] **Step 1: Write the failing test**

Create `packages/frontend/src/lib/iconCutout.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test"
import { analyzeCutout, hasAlpha, type RgbaImage } from "./iconCutout"

const solid = (
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number, number]
): RgbaImage => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  return { data, width, height }
}

const markOnWhite = solid(64, 64, (x, y) =>
  x > 16 && x < 48 && y > 16 && y < 48
    ? [20, 90, 200, 255]
    : [255, 255, 255, 255]
)

describe("hasAlpha", () => {
  it("is true when the image contains transparent pixels", () => {
    const image = solid(8, 8, (x) =>
      x === 0 ? [0, 0, 0, 0] : [10, 10, 10, 255]
    )
    expect(hasAlpha(image)).toBe(true)
  })

  it("is false for a fully opaque image", () => {
    expect(hasAlpha(markOnWhite)).toBe(false)
  })
})

describe("analyzeCutout", () => {
  it("accepts a mark on a flat white background", () => {
    const result = analyzeCutout(markOnWhite, { tolerance: 24 })
    expect(result.clean).toBe(true)
  })

  it("makes the background transparent and keeps the subject opaque", () => {
    const { alpha } = analyzeCutout(markOnWhite, { tolerance: 24 })
    expect(alpha[0]).toBe(0)
    expect(alpha[32 * 64 + 32]).toBe(255)
  })

  it("rejects a vertical gradient background", () => {
    const gradient = solid(64, 64, (x, y) =>
      x > 16 && x < 48 && y > 16 && y < 48
        ? [20, 90, 200, 255]
        : [255 - y * 3, 255 - y * 2, 255, 255]
    )
    const result = analyzeCutout(gradient, { tolerance: 24 })
    expect(result.clean).toBe(false)
    expect(result.checks.find((c) => c.id === "cornerSpread")?.passed).toBe(
      false
    )
  })

  it("rejects a subject that cannot be separated from its background", () => {
    const matched = solid(64, 64, (x, y) =>
      x > 16 && x < 48 && y > 16 && y < 48
        ? [242, 242, 242, 255]
        : [244, 244, 244, 255]
    )
    expect(analyzeCutout(matched, { tolerance: 24 }).clean).toBe(false)
  })

  it("does not reject a subject merely because it touches the edge", () => {
    const clipped = solid(64, 64, (x, y) =>
      x > 40 && y > 40 ? [20, 90, 200, 255] : [255, 255, 255, 255]
    )
    expect(analyzeCutout(clipped, { tolerance: 24 }).clean).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test --project frontend iconCutout`
Expected: FAIL — cannot resolve `./iconCutout`.

- [ ] **Step 3: Write the implementation**

Create `packages/frontend/src/lib/iconCutout.ts` by copying `packages/frontend/src/dev/icon-cutout/cutout.ts` and applying:

1. Delete the `MatchMode` type, the `mode` field on `CutoutParams`, and the ternary inside the BFS neighbour loop — always compare against the background reference:

```ts
      if (distance(data, n * 4, bgR, bgG, bgB) <= params.tolerance) push(n)
```

2. Delete the `borderRetained` metric, its accumulation loop, and its entry in `checks`.

3. Replace the exported constants block with:

```ts
export const CUTOUT_FEATHER = 1
export const CUTOUT_DEFAULT_TOLERANCE = 24
export const CUTOUT_MAX_TOLERANCE = 160
export const CUTOUT_PREVIEW_EDGE = 256
```

4. Add:

```ts
export const hasAlpha = (image: RgbaImage): boolean => {
  const { data } = image
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true
  return false
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test --project frontend iconCutout`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/lib/iconCutout.ts packages/frontend/src/lib/iconCutout.test.ts
git commit -m "feat(icons): add the icon cutout module (T-136)"
```

---

### Task 4: Render project icons

**Files:**
- Create: `packages/frontend/src/components/ProjectIconDisplay.tsx`
- Create: `packages/frontend/src/components/ProjectIconDisplay.test.tsx`
- Modify: `packages/frontend/src/components/ProjectTile.tsx:55-89`
- Modify: `packages/frontend/src/routes/_authed/route.tsx:309`
- Modify: `packages/frontend/messages/en/projects.json`

**Interfaces:**
- Consumes: `ProjectIconImage` type from Task 1; `attachmentUrl` from `@projectproject/shared`.
- Produces: `<ProjectIconDisplay orgSlug icon iconImage size />` where `size` is a number of CSS pixels. Every project icon in the app renders through this component.

- [ ] **Step 1: Write the failing test**

Create `packages/frontend/src/components/ProjectIconDisplay.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, expect, it } from "vite-plus/test"
import { ProjectIconDisplay } from "./ProjectIconDisplay"

const sticker = {
  type: "sticker" as const,
  sourceAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
  renderedAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M3",
  cutoutTolerance: 24,
  crop: { x: 0.5, y: 0.5, zoom: 1 }
}

describe("ProjectIconDisplay", () => {
  it("renders the emoji when there is no image", () => {
    render(<ProjectIconDisplay orgSlug="acme" icon="🌵" iconImage={null} size={40} />)
    expect(screen.queryByText("🌵")).not.toBeNull()
  })

  it("renders the rendered attachment for a sticker", () => {
    render(
      <ProjectIconDisplay orgSlug="acme" icon="🌵" iconImage={sticker} size={40} />
    )
    expect(screen.getByRole("img").getAttribute("src")).toBe(
      "/api/attachments/acme/01JBQ8Z3X4Y5W6V7T8S9R0Q1M3"
    )
  })

  it("renders the source attachment for full_bleed", () => {
    render(
      <ProjectIconDisplay
        orgSlug="acme"
        icon="🌵"
        iconImage={{
          type: "full_bleed",
          sourceAttachmentId: "01JBQ8Z3X4Y5W6V7T8S9R0Q1M2",
          crop: { x: 0.5, y: 0.5, zoom: 1 }
        }}
        size={40}
      />
    )
    expect(screen.getByRole("img").getAttribute("src")).toBe(
      "/api/attachments/acme/01JBQ8Z3X4Y5W6V7T8S9R0Q1M2"
    )
  })

  it("falls back to the emoji when the image fails to load", () => {
    render(
      <ProjectIconDisplay orgSlug="acme" icon="🌵" iconImage={sticker} size={40} />
    )
    fireEvent.error(screen.getByRole("img"))
    expect(screen.queryByText("🌵")).not.toBeNull()
    expect(screen.queryByRole("img")).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test --project frontend ProjectIconImage`
Expected: FAIL — cannot resolve `./ProjectIconImage`.

- [ ] **Step 3: Write the implementation**

Create `packages/frontend/src/components/ProjectIconDisplay.tsx`:

```tsx
import { useState } from "react"
import { attachmentUrl, type ProjectIconImage } from "@projectproject/shared"
import { cn } from "@/lib/utils"

export function ProjectIconDisplay({
  orgSlug,
  icon,
  iconImage,
  size,
  className
}: {
  orgSlug: string
  icon: string
  iconImage: ProjectIconImage | null
  size: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (!iconImage || failed) {
    return (
      <span className={className} style={{ fontSize: size * 0.6 }}>
        {icon}
      </span>
    )
  }

  const id =
    iconImage.type === "sticker"
      ? iconImage.renderedAttachmentId
      : iconImage.sourceAttachmentId

  return (
    <img
      src={attachmentUrl(orgSlug, id)}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn(
        "object-cover",
        iconImage.type === "sticker"
          ? "[filter:drop-shadow(0_0_1px_var(--icon-sticker-outline))_drop-shadow(0_1px_2px_rgb(0_0_0/0.45))]"
          : "rounded-[25%]",
        className
      )}
      style={
        iconImage.type === "full_bleed"
          ? {
              objectPosition: `${iconImage.crop.x * 100}% ${iconImage.crop.y * 100}%`,
              scale: String(iconImage.crop.zoom)
            }
          : undefined
      }
    />
  )
}
```

The outline is theme-driven rather than fixed white. Add to `packages/frontend/src/styles.css`, in the `:root` block:

```css
  --icon-sticker-outline: rgb(0 0 0 / 0.55);
```

and in the `.dark` block:

```css
  --icon-sticker-outline: rgb(255 255 255 / 0.9);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test --project frontend ProjectIconImage`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire up the render sites**

In `packages/frontend/src/components/ProjectTile.tsx`, widen the props to take `orgSlug: string` and `iconImage: ProjectIconImage | null`, and replace the bare `{icon}` at line 89 with:

```tsx
<ProjectIconDisplay
  orgSlug={orgSlug}
  icon={icon}
  iconImage={iconImage}
  size={40}
/>
```

In `packages/frontend/src/routes/_authed/route.tsx`, replace the bare `{icon}` at line 309 with the same component at `size={20}`, passing the `iconImage` now present on the project object from Task 1.

Follow the compiler to every `ProjectTile` callsite and pass the two new props.

- [ ] **Step 6: Run the frontend suite**

Run: `bun run test --project frontend && bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/frontend
git commit -m "feat(icons): render project icons through one component (T-136)"
```

---

### Task 5: The icon upload and preview surface

**Files:**
- Create: `packages/frontend/src/components/ProjectIconUpload.tsx`
- Modify: `packages/frontend/src/components/ProjectIdentityEditor.tsx`
- Modify: `packages/frontend/messages/en/projects.json`

**Interfaces:**
- Consumes: `analyzeCutout`, `hasAlpha`, `CUTOUT_DEFAULT_TOLERANCE`, `CUTOUT_MAX_TOLERANCE`, `CUTOUT_PREVIEW_EDGE` from Task 3; `ProjectIconDisplay` from Task 4; `uploadProjectImageAtom` from `@/atoms/attachments`; `updateProjectAtom`, `projectKey` from `@/atoms/projects`; `orgStorageAtom` from `@/atoms/storage`; `Slider` from `@/components/ui/slider`.
- Produces: `<ProjectIconUpload orgSlug slug iconImage />`, mounted inside `ProjectIdentityEditor`.

- [ ] **Step 1: Add the message keys**

In `packages/frontend/messages/en/projects.json`, add to the `project_` prefix group, alphabetically:

```json
  "project_icon_apply": "Apply",
  "project_icon_cancel": "Cancel",
  "project_icon_cutout_rejected": "The background isn't uniform enough to remove cleanly. The image will be cropped instead.",
  "project_icon_remove": "Remove image",
  "project_icon_storage_required": "Connect object storage to upload a project icon.",
  "project_icon_tolerance": "Background removal",
  "project_icon_treatment_full_bleed": "Cropped",
  "project_icon_treatment_sticker": "Cutout",
  "project_icon_upload": "Upload image",
```

- [ ] **Step 2: Write the component**

Create `packages/frontend/src/components/ProjectIconUpload.tsx`. It holds a `draft` of `{ file, bitmap, treatment, tolerance, crop }` and renders:

- an upload button, disabled when `storageAvailable` is false, with `m.project_icon_storage_required()` as its title in that state, matching how `ProjectBannerSettings` gates on `storageAvailable`;
- a live preview via `<ProjectIconDisplay>` fed from a canvas-derived object URL;
- a `<Slider size="compact" label={m.project_icon_tolerance()} min={0} max={CUTOUT_MAX_TOLERANCE} />`, shown only when the treatment is `sticker` and the source is not already transparent;
- apply and cancel buttons.

The analysis pipeline, given a decoded `ImageBitmap`:

```ts
const analyseAt = (bitmap: ImageBitmap, edge: number, tolerance: number) => {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, width, height)
  const image = ctx.getImageData(0, 0, width, height)
  const source = { data: image.data, width, height }
  if (hasAlpha(source)) return { source, alpha: null, clean: true }
  const result = analyzeCutout(source, { tolerance })
  return { source, alpha: result.alpha, clean: result.clean }
}
```

Preview calls pass `CUTOUT_PREVIEW_EDGE`; the apply path passes `CUTOUT_APPLY_MAX_EDGE` (512).

The apply path:

```ts
const compositeToBlob = (
  source: RgbaImage,
  alpha: Uint8ClampedArray | null
): Promise<Blob> => {
  const canvas = document.createElement("canvas")
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext("2d")!
  const out = ctx.createImageData(source.width, source.height)
  out.data.set(source.data)
  if (alpha)
    for (let p = 0; p < alpha.length; p++) out.data[p * 4 + 3] = alpha[p]
  ctx.putImageData(out, 0, 0)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png"
    )
  )
}

const apply = async () => {
  const { source, alpha, clean } = analyseAt(bitmap, CUTOUT_APPLY_MAX_EDGE, tolerance)
  const transparent = hasAlpha(source)

  const uploadedSource = await upload({ file })
  if (Exit.isFailure(uploadedSource)) return

  if (treatment === "full_bleed" || !clean) {
    const saved = await update({
      iconImage: {
        type: "full_bleed",
        sourceAttachmentId: uploadedSource.value.id,
        crop
      }
    })
    if (Exit.isSuccess(saved)) reset()
    return
  }

  const blob = transparent
    ? file
    : await compositeToBlob(source, alpha)
  const uploadedRendered = await upload({
    file: new File([blob], "icon.png", { type: "image/png" })
  })
  if (Exit.isFailure(uploadedRendered)) return

  const saved = await update({
    iconImage: {
      type: "sticker",
      sourceAttachmentId: uploadedSource.value.id,
      renderedAttachmentId: uploadedRendered.value.id,
      cutoutTolerance: transparent ? null : tolerance,
      crop
    }
  })
  if (Exit.isSuccess(saved)) reset()
}
```

`upload` and `update` are `useAtomSet(..., { mode: "promiseExit" })` handles on `uploadProjectImageAtom(key)` and `updateProjectAtom(key)`, exactly as `ProjectBannerSettings` sets them up. Removing an image calls `update({ iconImage: null })`.

When `analyzeCutout` returns `clean: false`, force the treatment to `full_bleed`, disable the sticker option, and show `m.project_icon_cutout_rejected()`.

- [ ] **Step 3: Mount it**

In `packages/frontend/src/components/ProjectIdentityEditor.tsx`, render `<ProjectIconUpload>` directly below the emoji picker inside the same popover, passing `orgSlug`, `slug`, and the project's `iconImage`.

- [ ] **Step 4: Verify against the real app**

Run: `bun run dev`, open a project's settings, and confirm: upload a flat-background logo and a photograph; the logo offers a cutout and the photo falls back to cropped with the rejection message; the tolerance slider changes the preview; apply persists across a reload; the emoji returns after removing the image.

- [ ] **Step 5: Run the suite and commit**

Run: `bun run test && bun run typecheck && bun run format`

```bash
git add packages/frontend
git commit -m "feat(icons): add the project icon upload and preview (T-136)"
```

---

### Task 6: Make the preview smooth

**Files:**
- Modify: `packages/frontend/src/components/ProjectIconUpload.tsx`

**Interfaces:**
- Consumes: everything from Task 5.
- Produces: no new exports.

`analyzeCutout` costs 23.7ms at 512px against a 16.7ms frame budget; at 256px it is 2.8ms. Task 5 already analyses previews at `CUTOUT_PREVIEW_EDGE`, which is the bulk of the fix. This task adds the scheduling.

- [ ] **Step 1: rAF-throttle the tolerance slider**

Replace the direct `setTolerance` handler with a ref-held pending value drained in `requestAnimationFrame`, so at most one analysis runs per frame and the preview tracks the thumb rather than lagging behind it:

```ts
const pending = useRef<number | null>(null)
const frame = useRef<number | null>(null)

const onToleranceChange = (value: number) => {
  setTolerance(value)
  pending.current = value
  if (frame.current !== null) return
  frame.current = requestAnimationFrame(() => {
    frame.current = null
    const next = pending.current
    pending.current = null
    if (next !== null) setAnalysis(analyseAt(bitmap, CUTOUT_PREVIEW_EDGE, next))
  })
}
```

Cancel any outstanding frame on unmount.

- [ ] **Step 2: Verify by hand**

Run `bun run dev`, drag the tolerance slider across its full range on a photograph, and confirm the preview keeps up without visible stutter.

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/ProjectIconUpload.tsx
git commit -m "perf(icons): throttle icon cutout previews to one per frame (T-136)"
```

---

### Task 7: Remove the spike

**Files:**
- Delete: `packages/frontend/src/routes/dev.icon-cutout.tsx`
- Delete: `packages/frontend/src/dev/`
- Delete: `tools/icon-cutout/`

- [ ] **Step 1: Delete the throwaway probe**

```bash
git rm -r packages/frontend/src/routes/dev.icon-cutout.tsx packages/frontend/src/dev tools/icon-cutout
```

The spike's findings live in the spec and in commit `32a676c4`; the working code lives in `packages/frontend/src/lib/iconCutout.ts`.

- [ ] **Step 2: Confirm nothing referenced it**

Run: `grep -rn "icon-cutout\|dev/icon" packages tools --include="*.ts" --include="*.tsx"`
Expected: no matches.

- [ ] **Step 3: Run the full suite**

Run: `bun run test && bun run typecheck && bun run format`
Expected: PASS. The generated `routeTree.gen.ts` will drop the dev route; commit that change too.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(icons): remove the T-136 cutout spike (T-136)"
```

---

## Notes for the implementer

- **The animated first-pass fill is deliberately not in this plan.** The spec describes it as a nice-to-have for the initial drop, where it doubles as progress for the full-resolution pass. It is not needed for correctness or smoothness — the 256px preview handles that — so it belongs in a follow-up rather than gating this work.
- **Do not reintroduce region growing.** It handles gradient backgrounds better but walks through subjects that fade toward the background, destroying them while still reporting success. The spike has the evidence.
- **Do not add a background-removal model.** Measured and rejected; the spec records the numbers.
