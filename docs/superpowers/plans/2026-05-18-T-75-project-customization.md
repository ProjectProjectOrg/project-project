# T-75 Project Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every project a customizable emoji icon and accent color (auto-assigned on create, editable via a combined popover from the project header and settings), then surface projects as a route-driven, animated group under the sidebar "Projects" link.

**Architecture:** Identity (icon + color) is DB-first on `project_index`, mirrored in markdown frontmatter on every write (same pattern as `name`). A shared deterministic resolver (`packages/shared/src/identity.ts`) derives default values from `slug` and is used by the DB migration backfill, the `create` handler, and as a defensive fallback during frontmatter decode. The combined popover puts the existing orbit `ColorPicker` on the left of the Frimousse emoji picker on the right; the picker stays open until outside-click/Esc. `updateProjectAtom` is converted to `Atom.optimisticFn` and also imperatively flips `projectsListAtom` so the sidebar row updates instantly. The sidebar projects group is purely route-driven (`expanded = pathname.startsWith('/orgs/${orgSlug}/projects')`) with `bg-accent` wrapping when expanded; active rows distinguish via colored icon tile + `text-foreground font-medium`.

**Tech Stack:** Effect 3.x, Effect Schema, Drizzle, `@effect-atom/atom-react`, TanStack Router, motion/react, Frimousse (`@frimousse/react`, installed via shadcn registry), paraglide for i18n. No other new dependencies.

**Branch & ticket:** Branch `feat/T-75-project-customization` (already created and checked out). Closes T-75.

---

## Background — settled design decisions

These came out of grilling and are locked. Do not redesign during implementation; if you hit a wall, escalate.

- **Identity is two fields: emoji icon + hex color.** Both required on `Project` and `ProjectDetail` wire shapes. Optional on `UpdateProjectInput` (partial update).
- **Identity is DB-first.** `project_index` gains `icon text NOT NULL` and `color text NOT NULL` columns. Frontmatter mirrors. Same pattern as `name`.
- **Deterministic resolver from slug.** `deriveProjectIcon(slug)` and `deriveProjectColor(slug)` in `packages/shared/src/identity.ts`. Used by: DB migration backfill, `create` handler, frontmatter decode fallback. Different djb2 salt per field so emoji and color don't correlate.
- **Starter palettes.** Icons: 20 curated emojis (rendered system-default, no Twemoji). Colors: existing `OUTER_RING` (13 swatches in `packages/shared/src/colors.ts`).
- **Permissions: owner + admin only** can edit identity. Members see it read-only (same gate as name).
- **Customization entry points: project header tile + settings General page.** Not on the projects index row in this PR.
- **Combined popover:** `ColorPicker` (orbit-ring, with new `closeOnSelect={false}` prop) on the left + Frimousse emoji picker on the right. Both stay open after select; popover dismisses on outside-click / Esc only.
- **Optimistic update:** `updateProjectAtom` converts to `Atom.optimisticFn` (covers name, body, icon, color uniformly). The mutation fn also imperatively flips `projectsListAtom` via `Atom.optimistic` wrapping so the sidebar row updates instantly. Refresh both bases after server lands.
- **Waiting pulse:** `animate-pulse` on icon tile in header, sidebar row, and settings tile while `result.waiting` is true. Don't pulse the popover (control surface, not data).
- **Error surface:** Inline at popover bottom while open; silent rollback if user already dismissed.
- **Sidebar projects group: pure route-driven.** No `useState` for expanded. `expanded = pathname.startsWith('/orgs/${orgSlug}/projects')`.
- **List:** All projects, alphabetical by name, no limit, no show-more. Row content: emoji + name. No project key or createdAt.
- **Group container visual:** `bg-accent rounded-lg` when expanded only. Projects header keeps existing `font-medium` weight as anchor. Active row distinguished by colored icon tile (`bg-{color}` vs neutral `bg-muted`) + `text-foreground font-medium` (inactive rows are `text-muted-foreground`). No additional row background.
- **Animation:** `motion.div` height + opacity, `duration: 0.2, ease: [0.2, 0.8, 0.2, 1]` (matches existing rail-swap at `route.tsx:107–124`). Icon tile color swap rides CSS `transition-colors`.
- **i18n:** New `project_identity_*` keys go in `packages/frontend/messages/en/projects.json`. New picker aria-labels (emoji, color) into `common.json` under `emoji_` / `color_` prefixes.
- **No comments** in code (project rule). All explanation lives in commit messages.

---

## File structure

### Files to create

- `packages/shared/src/identity.ts` — `PROJECT_STARTER_EMOJIS`, `deriveProjectIcon(slug)`, `deriveProjectColor(slug)`, internal `djb2(s)` hash.
- `packages/shared/src/identity.test.ts` — determinism + decorrelation tests.
- `packages/backend/src/db/migrations/0012_project_identity.sql` — adds `icon` + `color` columns, backfills, sets NOT NULL.
- `packages/frontend/src/components/ProjectIdentityEditor.tsx` — the button-tile + popover surface containing the combined picker. Used in project header and settings General.
- `packages/frontend/src/components/ui/emoji-picker.tsx` — installed by `npx shadcn add https://frimousse.liveblocks.io/r/emoji-picker`. **Do not hand-edit.**

### Files to modify

- `packages/shared/src/index.ts` — re-export `identity.ts`.
- `packages/shared/src/schemas/Project.ts` — add required `icon: Schema.String` + `color: TagColor` to `Project` and `ProjectDetail`; add optional `icon` + `color` to `UpdateProjectInput`.
- `packages/backend/src/db/schema.ts` — add `icon` + `color` columns to `projectIndex`.
- `packages/backend/src/Services/ProjectDocs.ts` — extend `ProjectDocument` + `ProjectDocumentWrite` interfaces with required icon + color.
- `packages/backend/src/Layers/ProjectDocs.ts` — extend `ProjectFrontmatter` schema (optional with resolver fallback after decode); extend `toFrontmatter` to emit icon + color.
- `packages/backend/src/Layers/Projects.ts` — `list` reads `icon` + `color` from `projectIndex`; `get` returns them; `create` derives via `deriveProjectIdentity(slug)`, inserts into DB, stamps frontmatter; `update` accepts and persists `icon` + `color`; `syncFrontmatter` carries them through.
- `packages/frontend/src/atoms/projects.ts` — split `projectsListAtom` into base + `Atom.optimistic` wrapper; convert `updateProjectAtom` to `Atom.optimisticFn` against `projectAtom` and imperatively flip the list cache before the API call.
- `packages/frontend/src/components/ColorPicker.tsx` — add `closeOnSelect?: boolean` prop (default `true`); skip `setOpen(false)` when false.
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/route.tsx` — replace the hard-coded header tile with `<ProjectIdentityEditor>`; pulse on `updateState.waiting`.
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/settings/general.tsx` — add an "Icon & color" row using `<ProjectIdentityEditor>` at the top of the form.
- `packages/frontend/src/routes/_authed/route.tsx` — replace single Projects `<NavItem>` with `<ProjectsGroup>` rendering the route-driven expand/collapse + alphabetical project list with animated height.
- `packages/frontend/messages/en/projects.json` — new identity-related keys.
- `packages/frontend/messages/en/common.json` — new aria-label keys for emoji/color pickers.

### Files to delete

None.

---

## Phase A — Shared identity module + schema

### Task A1: Create the deterministic identity resolver

**Files:**
- Create: `packages/shared/src/identity.ts`
- Create: `packages/shared/src/identity.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/src/identity.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  PROJECT_STARTER_EMOJIS,
  deriveProjectIcon,
  deriveProjectColor
} from "./identity"
import { OUTER_RING } from "./colors"

describe("PROJECT_STARTER_EMOJIS", () => {
  it("has 20 unique entries", () => {
    expect(PROJECT_STARTER_EMOJIS).toHaveLength(20)
    expect(new Set(PROJECT_STARTER_EMOJIS).size).toBe(20)
  })
})

describe("deriveProjectIcon", () => {
  it("is deterministic for the same slug", () => {
    expect(deriveProjectIcon("project-project")).toBe(
      deriveProjectIcon("project-project")
    )
  })
  it("returns a value from the starter palette", () => {
    expect(PROJECT_STARTER_EMOJIS).toContain(deriveProjectIcon("anything"))
  })
})

describe("deriveProjectColor", () => {
  it("is deterministic for the same slug", () => {
    expect(deriveProjectColor("project-project")).toBe(
      deriveProjectColor("project-project")
    )
  })
  it("returns a value from OUTER_RING", () => {
    const palette = OUTER_RING.map((c) => c.hex)
    expect(palette).toContain(deriveProjectColor("anything"))
  })
})

describe("icon vs color decorrelation", () => {
  it("does not produce a single (icon, color) combo for varying slugs", () => {
    const seen = new Set<string>()
    for (const slug of [
      "alpha",
      "beta",
      "gamma",
      "delta",
      "epsilon",
      "zeta",
      "eta",
      "theta",
      "iota",
      "kappa"
    ]) {
      seen.add(`${deriveProjectIcon(slug)}|${deriveProjectColor(slug)}`)
    }
    expect(seen.size).toBeGreaterThan(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/shared/src/identity.test.ts`
Expected: FAIL — module `./identity` does not exist.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/identity.ts`:

```ts
import { OUTER_RING } from "./colors"

export const PROJECT_STARTER_EMOJIS = [
  "🚀",
  "📦",
  "🎯",
  "⚙️",
  "🧪",
  "📚",
  "🎨",
  "💡",
  "🔧",
  "🌱",
  "⚡",
  "🎮",
  "🛠",
  "🧭",
  "🔬",
  "📊",
  "🏗",
  "🪐",
  "🔮",
  "🏷"
] as const

const djb2 = (s: string): number => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export const deriveProjectIcon = (slug: string): string =>
  PROJECT_STARTER_EMOJIS[djb2(slug) % PROJECT_STARTER_EMOJIS.length]

export const deriveProjectColor = (slug: string): string =>
  OUTER_RING[djb2(`${slug}:color`) % OUTER_RING.length].hex

export const deriveProjectIdentity = (
  slug: string
): { icon: string; color: string } => ({
  icon: deriveProjectIcon(slug),
  color: deriveProjectColor(slug)
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/shared/src/identity.test.ts`
Expected: all PASS.

- [ ] **Step 5: Re-export from shared index**

Modify `packages/shared/src/index.ts`. Add (in a location consistent with other re-exports):

```ts
export * from "./identity"
```

- [ ] **Step 6: Type-check shared**

Run: `bun run --filter @projectproject/shared typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/identity.ts packages/shared/src/identity.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): deterministic project identity resolver"
```

---

### Task A2: Extend Project schemas with icon + color

**Files:**
- Modify: `packages/shared/src/schemas/Project.ts`

- [ ] **Step 1: Write the failing test additions**

Append to `packages/shared/src/schemas/Project.test.ts`:

```ts
import { Project, ProjectDetail, UpdateProjectInput } from "./Project"

describe("Project with identity", () => {
  it("requires icon and color", () => {
    const decode = Schema.decodeUnknownEither(Project)
    const minimal = {
      org: "demo",
      slug: "demo",
      key: "T",
      name: "Demo",
      createdBy: "user-1",
      createdAt: new Date(),
      icon: "🚀",
      color: "#abcdef"
    }
    expect(decode(minimal)._tag).toBe("Right")
    const { icon, ...withoutIcon } = minimal
    expect(decode(withoutIcon)._tag).toBe("Left")
  })

  it("validates color as hex", () => {
    const decode = Schema.decodeUnknownEither(Project)
    expect(
      decode({
        org: "demo",
        slug: "demo",
        key: "T",
        name: "Demo",
        createdBy: "user-1",
        createdAt: new Date(),
        icon: "🚀",
        color: "not-hex"
      })._tag
    ).toBe("Left")
  })
})

describe("UpdateProjectInput with identity", () => {
  it("accepts partial identity updates", () => {
    const decode = Schema.decodeUnknownEither(UpdateProjectInput)
    expect(decode({ icon: "📦" })._tag).toBe("Right")
    expect(decode({ color: "#abcdef" })._tag).toBe("Right")
    expect(decode({})._tag).toBe("Right")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/shared/src/schemas/Project.test.ts`
Expected: the new describe blocks fail with "missing key" or "type mismatch."

- [ ] **Step 3: Add the schema fields**

Modify `packages/shared/src/schemas/Project.ts`.

Add an `Icon` brand near the top, after `TagColor` isn't reused directly — but `TagColor` already exists in `Tag.ts` and is `Schema.String.pipe(Schema.pattern(/^#[0-9a-f]{6}$/i), Schema.brand("TagColor"))`. We don't want a circular dep; declare a local `ProjectColor` with the same pattern. Insert after `Role`:

```ts
export const ProjectIcon = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(16),
  Schema.brand("ProjectIcon")
)
export type ProjectIcon = typeof ProjectIcon.Type

export const ProjectColor = Schema.String.pipe(
  Schema.pattern(/^#[0-9a-f]{6}$/i),
  Schema.brand("ProjectColor")
)
export type ProjectColor = typeof ProjectColor.Type
```

Then extend `Project`:

```ts
export const Project = Schema.Struct({
  org: Slug,
  slug: Slug,
  key: ProjectKey,
  name: Schema.String,
  icon: ProjectIcon,
  color: ProjectColor,
  createdBy: Schema.String,
  createdAt: Schema.Date
})
```

`ProjectDetail` already spreads `Project.fields` so it inherits automatically. Extend `UpdateProjectInput`:

```ts
export const UpdateProjectInput = Schema.Struct({
  name: Schema.optional(
    Schema.String.pipe(Schema.minLength(1), Schema.maxLength(120))
  ),
  body: Schema.optional(Schema.String),
  icon: Schema.optional(ProjectIcon),
  color: Schema.optional(ProjectColor)
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/shared/src/schemas/Project.test.ts`
Expected: all PASS.

- [ ] **Step 5: Type-check shared**

Run: `bun run --filter @projectproject/shared typecheck`
Expected: no errors. (Backend / frontend will now fail to compile — that's expected; we fix in subsequent tasks.)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/Project.ts packages/shared/src/schemas/Project.test.ts
git commit -m "feat(shared): project schema gains required icon + color"
```

---

## Phase B — Database migration + backend wiring

### Task B1: Add icon + color to the project_index Drizzle schema

**Files:**
- Modify: `packages/backend/src/db/schema.ts:59–83`

- [ ] **Step 1: Add the columns**

In `packages/backend/src/db/schema.ts`, modify the `projectIndex` definition to add `icon` and `color` columns. Insert after `name`:

```ts
export const projectIndex = pgTable(
  "project_index",
  {
    id: uuid("id").defaultRandom().notNull().unique(),
    slug: text("slug").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade"
      }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    uniqueIndex("project_index_organization_key_uidx").on(
      table.organizationId,
      table.key
    ),
    uniqueIndex("project_index_slug_id_uidx").on(table.slug, table.id)
  ]
)
```

- [ ] **Step 2: Generate the migration**

Run: `bun run --filter @projectproject/backend db:generate`
Expected: a new file `packages/backend/src/db/migrations/0012_*.sql` is generated containing `ADD COLUMN icon` and `ADD COLUMN color` for `project_index`. The generator will likely emit a `NOT NULL` failure because existing rows have no value.

- [ ] **Step 3: Rewrite the generated migration to backfill**

Open the generated SQL file. Replace its contents with a backfill that uses a tiny inline djb2 implementation against the slug to compute deterministic defaults. The starter emoji array and outer-ring colors are hard-coded in the SQL — they MUST match `packages/shared/src/identity.ts` exactly.

Replace with:

```sql
-- 0012_project_identity.sql
ALTER TABLE "project_index" ADD COLUMN "icon" text;
ALTER TABLE "project_index" ADD COLUMN "color" text;

DO $$
DECLARE
  rec RECORD;
  hash bigint;
  i int;
  c char;
  emojis text[] := ARRAY['🚀','📦','🎯','⚙️','🧪','📚','🎨','💡','🔧','🌱','⚡','🎮','🛠','🧭','🔬','📊','🏗','🪐','🔮','🏷'];
  colors text[] := ARRAY['#d4554b','#d27031','#cb893b','#bca046','#9eb650','#75c465','#3fcd83','#3fc6aa','#46c0c8','#5db1d8','#7d9ae0','#a87fd9','#cf67c1'];
  salted text;
BEGIN
  FOR rec IN SELECT slug FROM project_index LOOP
    hash := 5381;
    FOR i IN 1..length(rec.slug) LOOP
      hash := ((hash << 5) + hash + ascii(substring(rec.slug from i for 1))) & x'7fffffff'::bigint;
    END LOOP;
    UPDATE project_index SET icon = emojis[1 + (hash % 20)::int] WHERE slug = rec.slug;

    salted := rec.slug || ':color';
    hash := 5381;
    FOR i IN 1..length(salted) LOOP
      hash := ((hash << 5) + hash + ascii(substring(salted from i for 1))) & x'7fffffff'::bigint;
    END LOOP;
    UPDATE project_index SET color = colors[1 + (hash % 13)::int] WHERE slug = rec.slug;
  END LOOP;
END $$;

ALTER TABLE "project_index" ALTER COLUMN "icon" SET NOT NULL;
ALTER TABLE "project_index" ALTER COLUMN "color" SET NOT NULL;
```

The 13 hex colors in the `colors` array MUST match `OUTER_RING.map(c => c.hex)` from `packages/shared/src/colors.ts`. Compute those once and paste:

Run: `bun -e 'import("./packages/shared/src/colors.ts").then(m => console.log(JSON.stringify(m.OUTER_RING.map(c => c.hex))))'`

Use the resulting array verbatim in the SQL.

- [ ] **Step 4: Apply the migration**

Run: `bun run --filter @projectproject/backend db:migrate`
Expected: migration applies cleanly. The existing `project-project/project-project` row gets icon + color filled.

- [ ] **Step 5: Verify the backfill**

Run: `psql $DATABASE_URL -c "SELECT slug, icon, color FROM project_index;"`
Expected: all rows have non-null icon (one of the 20 emojis) and color (one of the 13 hexes).

- [ ] **Step 6: Verify backfill matches the resolver**

In a node REPL or one-off script, confirm `deriveProjectIdentity("project-project")` from `packages/shared/src/identity.ts` returns the same icon + color as the DB row. They must agree.

Run: `bun -e 'import("./packages/shared/src/identity.ts").then(m => console.log(m.deriveProjectIdentity("project-project")))'`

Compare against the DB row output from Step 5.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/db/schema.ts packages/backend/src/db/migrations/0012_project_identity.sql packages/backend/src/db/migrations/meta
git commit -m "feat(backend): project_index gains icon + color columns with deterministic backfill"
```

---

### Task B2: Extend ProjectDocs interfaces and frontmatter encoding

**Files:**
- Modify: `packages/backend/src/Services/ProjectDocs.ts`
- Modify: `packages/backend/src/Layers/ProjectDocs.ts`

- [ ] **Step 1: Extend the ProjectDocs interfaces**

In `packages/backend/src/Services/ProjectDocs.ts`, add `icon` and `color` to both `ProjectDocument` and `ProjectDocumentWrite`. They're required in `ProjectDocumentWrite` (we always know them on write) and required in `ProjectDocument` after the read-side resolver fallback.

```ts
export interface ProjectDocument {
  readonly org?: Slug
  readonly slug: Slug
  readonly key?: ProjectKey
  readonly name: string
  readonly icon: string
  readonly color: string
  readonly createdBy?: string
  readonly createdAt: Date
  readonly members: ReadonlyArray<ProjectDocMember>
  readonly github: GithubConnection | null
  readonly setup: ProjectSetup
  readonly body: string
}

export interface ProjectDocumentWrite {
  readonly org: string
  readonly slug: string
  readonly key: ProjectKey
  readonly name: string
  readonly icon: string
  readonly color: string
  readonly createdBy: string
  readonly createdAt: Date
  readonly members: ReadonlyArray<ProjectDocMember>
  readonly github: GithubConnection | null
  readonly setup: ProjectSetup
  readonly body: string
}
```

- [ ] **Step 2: Extend the frontmatter decoder with optional icon + color**

In `packages/backend/src/Layers/ProjectDocs.ts`, the `ProjectFrontmatter` schema currently has all the document fields. Add icon + color as **optional** (legacy projects on disk may not have them yet — we resolve after decode). Insert after `name`:

```ts
const ProjectFrontmatter = Schema.Struct({
  org: Schema.optional(Slug),
  slug: Slug,
  key: Schema.optional(ProjectKey),
  name: Schema.String,
  icon: Schema.optional(Schema.String),
  color: Schema.optional(Schema.String),
  createdBy: Schema.optional(Schema.String),
  createdAt: Schema.Date,
  members: Schema.optionalWith(Schema.Array(ProjectDocMember), {
    default: () => []
  }),
  github: Schema.optionalWith(Schema.NullOr(ProjectDocGithub), {
    default: () => null
  }),
  setup: Schema.optionalWith(ProjectDocSetup, {
    default: () => ({
      workflowReviewedAt: null,
      invitePeopleDismissedAt: null,
      connectGithubDismissedAt: null
    })
  })
})
```

- [ ] **Step 3: Resolve defaults after decode in `read`**

Still in `packages/backend/src/Layers/ProjectDocs.ts`, import the resolver at top:

```ts
import { deriveProjectIdentity } from "@projectproject/shared"
```

Then modify the `read` function so the returned `ProjectDocument` always has icon + color (falling back to the resolver when frontmatter is missing them):

```ts
const read = (
  orgSlug: string,
  slug: string
): Effect.Effect<ProjectDocument, NotFound | MarkdownError> =>
  withProjectDocTelemetry(
    "read",
    orgSlug,
    slug,
    Effect.gen(function* () {
      const file = yield* markdown.readProjectFile(orgSlug, slug)
      yield* checkOrgFrontmatter(orgSlug, file.data)
      const frontmatter = yield* decodeProjectFrontmatter(file.data).pipe(
        Effect.tapErrorCause((cause) =>
          Effect.logWarning("project frontmatter decode failed").pipe(
            Effect.annotateLogs({ cause: Cause.pretty(cause) })
          )
        ),
        Effect.orDie
      )
      const fallback = deriveProjectIdentity(slug)
      return {
        ...frontmatter,
        icon: frontmatter.icon ?? fallback.icon,
        color: frontmatter.color ?? fallback.color,
        body: file.body
      }
    })
  )
```

- [ ] **Step 4: Emit icon + color in `toFrontmatter`**

Still in `packages/backend/src/Layers/ProjectDocs.ts`, modify `toFrontmatter` to include `icon` and `color`:

```ts
function toFrontmatter(
  document: ProjectDocumentWrite
): Record<string, unknown> {
  const frontmatter: Record<string, unknown> = {
    org: document.org,
    slug: document.slug,
    key: document.key,
    name: document.name,
    icon: document.icon,
    color: document.color,
    createdBy: document.createdBy,
    createdAt: document.createdAt.toISOString(),
    members: document.members.map((member) => ({
      username: member.username,
      role: member.role
    }))
  }
  if (document.github) {
    frontmatter.github = {
      repoOwner: document.github.repoOwner,
      repoName: document.github.repoName,
      defaultBaseBranch: document.github.defaultBaseBranch
    } satisfies GithubConnection
  }
  frontmatter.setup = {
    workflowReviewedAt:
      document.setup.workflowReviewedAt?.toISOString() ?? null,
    invitePeopleDismissedAt:
      document.setup.invitePeopleDismissedAt?.toISOString() ?? null,
    connectGithubDismissedAt:
      document.setup.connectGithubDismissedAt?.toISOString() ?? null
  }
  return frontmatter
}
```

- [ ] **Step 5: Type-check backend**

Run: `bun run --filter @projectproject/backend typecheck`
Expected: `Layers/Projects.ts` is now broken because `syncFrontmatter` doesn't pass icon + color. That's expected; we fix it next.

- [ ] **Step 6: Don't commit yet** — backend won't compile; bundle this with B3.

---

### Task B3: Wire icon + color through Projects layer

**Files:**
- Modify: `packages/backend/src/Layers/Projects.ts`

- [ ] **Step 1: Import the resolver**

At the top of `packages/backend/src/Layers/Projects.ts`, add to the existing shared-imports block:

```ts
import { deriveProjectIdentity } from "@projectproject/shared"
```

- [ ] **Step 2: Extend `syncFrontmatter` signature**

Modify the `syncFrontmatter` helper to accept icon + color:

```ts
const syncFrontmatter = (
  orgSlug: string,
  slug: string,
  name: string,
  icon: string,
  color: string,
  createdBy: string,
  createdAt: Date,
  key: ProjectKey,
  body: string,
  members: ReadonlyArray<Member>,
  connection: GithubConnection | null,
  setup: ProjectSetup
): Effect.Effect<void, MarkdownError> =>
  projectDocs.write(orgSlug, slug, {
    org: orgSlug,
    slug,
    key,
    name,
    icon,
    color,
    createdBy,
    createdAt,
    members: members.map((m) => ({
      username: m.username ?? m.email,
      role: m.role
    })),
    github: connection,
    setup,
    body
  })
```

- [ ] **Step 3: Update `list` to include icon + color from the DB**

Find `list` (around line 281). Add `icon` and `color` to `baseSelect` and to the row mapping:

```ts
const baseSelect = {
  slug: projectIndex.slug,
  key: projectIndex.key,
  name: projectIndex.name,
  icon: projectIndex.icon,
  color: projectIndex.color,
  createdBy: projectIndex.createdBy,
  createdAt: projectIndex.createdAt
}
// ... unchanged query bodies ...
return rows.map((r) => ({
  org: orgSlug,
  slug: r.slug,
  key: makeProjectKey(r.key),
  name: r.name,
  icon: r.icon,
  color: r.color,
  createdBy: r.createdBy,
  createdAt: r.createdAt
}))
```

- [ ] **Step 4: Update `create`**

Find `create` (around line 492). After computing `slug` and `key`, derive identity from slug, insert into the DB row, and pass through to `syncFrontmatter`:

```ts
const create = (
  orgSlug: string,
  createdBy: string,
  input: CreateProjectInput
): Effect.Effect<Project, NotFound | Conflict> =>
  withProjectTelemetry(
    "create",
    orgSlug,
    { createdBy, projectName: input.name, projectKey: input.key },
    Effect.gen(function* () {
      const organizationId = yield* orgIdFromSlug(orgSlug)
      const slug = yield* findFreeSlug(slugify(input.name))
      const createdAt = yield* DateTime.nowAsDate
      const key = makeProjectKey(input.key)
      const identity = deriveProjectIdentity(slug)
      // ... existingKey check unchanged ...

      const [row] = yield* db
        .insert(projectIndex)
        .values({
          slug,
          key,
          name: input.name,
          icon: identity.icon,
          color: identity.color,
          createdBy,
          createdAt,
          organizationId
        })
        .returning()
        .pipe(/* unchanged */)

      // ... member insert + rollback unchanged ...

      const members = yield* loadMembers(slug)
      yield* syncFrontmatter(
        orgSlug,
        slug,
        input.name,
        identity.icon,
        identity.color,
        createdBy,
        createdAt,
        key,
        `# ${input.name}\n`,
        members,
        null,
        defaultSetup()
      ).pipe(/* unchanged catchAll */)

      return {
        org: orgSlug,
        slug: row.slug,
        key: makeProjectKey(row.key),
        name: row.name,
        icon: row.icon,
        color: row.color,
        createdBy: row.createdBy,
        createdAt: row.createdAt
      }
    })
  )
```

- [ ] **Step 5: Update `get`**

Find `get` (around line 582). Add `icon` and `color` to the returned `ProjectDetail`:

```ts
return {
  org: orgSlug,
  slug: indexRow.slug,
  key,
  name: indexRow.name,
  icon: indexRow.icon,
  color: indexRow.color,
  createdBy: indexRow.createdBy,
  createdAt: indexRow.createdAt,
  github: file.github,
  setup: file.setup,
  body: file.body,
  members,
  pendingMembers
}
```

- [ ] **Step 6: Update `update`**

Find `update` (around line 614). Compute next icon + color from input or fall back to current; persist to DB and frontmatter:

```ts
const update = (
  orgSlug: string,
  userId: string,
  slug: string,
  input: UpdateProjectInput
): Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError> =>
  withProjectTelemetry(
    "update",
    orgSlug,
    { slug, userId },
    Effect.gen(function* () {
      yield* requireRole(orgSlug, userId, slug, ["owner", "admin"])
      const indexRow = yield* getIndexRowInOrg(orgSlug, slug)
      const file = yield* projectDocs.read(orgSlug, slug)

      const nextName = input.name ?? indexRow.name
      const nextBody = input.body ?? file.body
      const nextIcon = input.icon ?? indexRow.icon
      const nextColor = input.color ?? indexRow.color

      const dbPatch: Partial<typeof projectIndex.$inferInsert> = {}
      if (input.name !== undefined && input.name !== indexRow.name) {
        dbPatch.name = nextName
      }
      if (input.icon !== undefined && input.icon !== indexRow.icon) {
        dbPatch.icon = nextIcon
      }
      if (input.color !== undefined && input.color !== indexRow.color) {
        dbPatch.color = nextColor
      }
      if (Object.keys(dbPatch).length > 0) {
        yield* db
          .update(projectIndex)
          .set(dbPatch)
          .where(eq(projectIndex.slug, slug))
          .pipe(Effect.orDie)
      }

      const members = yield* loadMembers(slug)
      const pendingMembers = yield* loadPendingMembers(slug)
      yield* syncFrontmatter(
        orgSlug,
        slug,
        nextName,
        nextIcon,
        nextColor,
        indexRow.createdBy,
        indexRow.createdAt,
        makeProjectKey(indexRow.key),
        nextBody,
        members,
        file.github,
        file.setup
      )

      return {
        org: orgSlug,
        slug,
        key: makeProjectKey(indexRow.key),
        name: nextName,
        icon: nextIcon,
        color: nextColor,
        createdBy: indexRow.createdBy,
        createdAt: indexRow.createdAt,
        github: file.github,
        setup: file.setup,
        body: nextBody,
        members,
        pendingMembers
      }
    })
  )
```

- [ ] **Step 7: Update all other call-sites of `syncFrontmatter` to pass icon + color**

There are several: `updateSetup`, `replayDetail`, `connectGithub`, `disconnectGithub`. Each one currently passes name/body/etc. but not icon/color. For each, after fetching `indexRow`, pass `indexRow.icon` and `indexRow.color` through.

Also update the `ProjectDetail` returned by each (`updateSetup`, `connectGithub`, `disconnectGithub`) to include `icon: indexRow.icon` and `color: indexRow.color`.

Also update `replayDetail` similarly — it returns `ProjectDetail` and calls `syncFrontmatter`.

This is mechanical — search for `syncFrontmatter(` and `return {` blocks returning `ProjectDetail`, and add the two fields everywhere.

- [ ] **Step 8: Type-check backend**

Run: `bun run --filter @projectproject/backend typecheck`
Expected: PASS — no errors.

- [ ] **Step 9: Run backend tests**

Run: `bun test packages/backend`
Expected: existing tests still pass. If a test fixture constructed a `Project` or `ProjectDetail` without icon/color, add them (use any value, e.g. `icon: "🚀", color: "#7d9ae0"`).

- [ ] **Step 10: Commit**

```bash
git add packages/backend/src/Services/ProjectDocs.ts packages/backend/src/Layers/ProjectDocs.ts packages/backend/src/Layers/Projects.ts
git commit -m "feat(backend): project identity flows through DB + frontmatter"
```

---

### Task B4: End-to-end smoke test of the backend changes

**Files:**
- (none — manual verification)

- [ ] **Step 1: Restart the backend dev server**

Whatever command Wouter normally uses (`bun run --filter @projectproject/backend dev` or the compose stack). Ensure the new migration is applied.

- [ ] **Step 2: Hit the list endpoint**

Run: `curl -s http://localhost:3001/api/orgs/project-project/projects | jq '.[] | {slug, icon, color}'`
Expected: every project in the response has a non-null icon (emoji) and color (hex). Values match `deriveProjectIdentity(slug)`.

- [ ] **Step 3: Hit the get endpoint**

Run: `curl -s http://localhost:3001/api/orgs/project-project/projects/project-project | jq '{slug, icon, color}'`
Expected: same values as the list.

- [ ] **Step 4: Hit the update endpoint with a new emoji**

Run:

```bash
curl -s -X PATCH http://localhost:3001/api/orgs/project-project/projects/project-project \
  -H "Content-Type: application/json" \
  -d '{"icon":"📦","color":"#3fc6aa"}'
```

Expected: response includes `icon: "📦"` and `color: "#3fc6aa"`.

- [ ] **Step 5: Verify the markdown frontmatter**

Open `data/projects/project-project/project-project/project.md` (or wherever the markdown lives in your bind-mount). The frontmatter should now include `icon: 📦` and `color: '#3fc6aa'`.

- [ ] **Step 6: Reset to defaults** so the rest of the work starts from a deterministic state:

```bash
curl -s -X PATCH http://localhost:3001/api/orgs/project-project/projects/project-project \
  -H "Content-Type: application/json" \
  -d "{\"icon\":\"$(bun -e 'import("./packages/shared/src/identity.ts").then(m=>process.stdout.write(m.deriveProjectIcon("project-project")))')\",\"color\":\"$(bun -e 'import("./packages/shared/src/identity.ts").then(m=>process.stdout.write(m.deriveProjectColor("project-project")))')\"}"
```

(Or just pick any emoji + color you like — this isn't load-bearing.)

- [ ] **Step 7: No commit** — verification only.

---

## Phase C — Frontend atoms with optimism + list flip

### Task C1: Wrap projectsListAtom in Atom.optimistic and convert updateProjectAtom

**Files:**
- Modify: `packages/frontend/src/atoms/projects.ts`

- [ ] **Step 1: Refactor the list atom and convert the update mutation**

Replace lines 18–59 of `packages/frontend/src/atoms/projects.ts` with the following. The shape: a private `projectsListBaseAtom`, a public `projectsListAtom` wrapped in `Atom.optimistic`, and `updateProjectAtom` converted to `Atom.optimisticFn` against `projectAtom`. The mutation fn imperatively flips the list cache via `get.set` before the API call.

```ts
const projectsListBaseAtom = Atom.family((orgSlug: string) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.projects.list({ path: { orgSlug } })
      })
    )
    .pipe(Atom.setIdleTTL("1 minute"))
)

export const projectsListAtom = Atom.family((orgSlug: string) =>
  Atom.optimistic(projectsListBaseAtom(orgSlug))
)

const projectBaseAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.projects.get({ path: { orgSlug, slug } })
      })
    )
    .pipe(Atom.setIdleTTL("2 minutes"))
})

export const projectAtom = Atom.family((key: string) =>
  Atom.optimistic(projectBaseAtom(key))
)

export const updateProjectAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return Atom.optimisticFn(projectAtom(key), {
    reducer: (
      current,
      input: {
        name?: string
        body?: string
        icon?: string
        color?: string
      }
    ) =>
      Result.isSuccess(current)
        ? Result.success({ ...current.value, ...input }, { waiting: true })
        : current,
    fn: runtime.fn(
      Effect.fn(function* (
        input: {
          name?: string
          body?: string
          icon?: string
          color?: string
        },
        get
      ) {
        const listResult = get(projectsListAtom(orgSlug))
        if (Result.isSuccess(listResult)) {
          const nextList = listResult.value.map((p) =>
            p.slug === slug ? { ...p, ...input } : p
          )
          get.set(
            projectsListAtom(orgSlug),
            Result.success(nextList, { waiting: true })
          )
        }
        const client = yield* ApiClient
        const updated = yield* client.projects.update({
          path: { orgSlug, slug },
          payload: input
        })
        get.refresh(projectBaseAtom(key))
        get.refresh(projectsListBaseAtom(orgSlug))
        return updated
      })
    )
  })
})
```

If the existing import line `import { Atom, Result } from "@effect-atom/atom-react"` is already present, leave it. Confirm `Result` is imported.

- [ ] **Step 2: Type-check frontend**

Run: `bun run --filter @projectproject/frontend typecheck`
Expected: this file passes; downstream consumers of `projectAtom` / `projectsListAtom` (e.g., `settings/general.tsx`, project list view) still work because the public type didn't change.

- [ ] **Step 3: Smoke-test in the dev server**

Start the FE dev server (whatever you normally use). Navigate to `/orgs/project-project/projects/project-project/settings/general`. Change the project name → save. Verify it still works end-to-end (the optimistic path).

There's no UI for icon/color yet, so this is just a smoke test for the refactor.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/atoms/projects.ts
git commit -m "feat(frontend): updateProjectAtom becomes optimistic, list cache flips synchronously"
```

---

## Phase D — Picker primitives

### Task D1: Add closeOnSelect prop to ColorPicker

**Files:**
- Modify: `packages/frontend/src/components/ColorPicker.tsx`

- [ ] **Step 1: Add the prop**

In `packages/frontend/src/components/ColorPicker.tsx`, extend the `Props` type and respect the flag in `select`:

```ts
type Props = {
  value: string
  onChange: (hex: string) => void
  className?: string
  ariaLabel?: string
  closeOnSelect?: boolean
}
```

Modify the component signature and `select`:

```ts
export function ColorPicker({
  value,
  onChange,
  className,
  ariaLabel,
  closeOnSelect = true
}: Props) {
  // ... existing state + effects unchanged ...

  const select = (hex: string) => {
    onChange(hex)
    if (closeOnSelect) setOpen(false)
  }

  // ... unchanged JSX ...
}
```

- [ ] **Step 2: Type-check frontend**

Run: `bun run --filter @projectproject/frontend typecheck`
Expected: PASS.

- [ ] **Step 3: Smoke test the existing callsites**

Grep for `<ColorPicker` in the frontend. Confirm none break (the prop defaults to true). The existing callsite is in `TagEditor.tsx` / similar — verify the tag picker still closes on swatch click.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/ColorPicker.tsx
git commit -m "feat(frontend): ColorPicker gains closeOnSelect prop"
```

---

### Task D2: Install the Frimousse emoji picker via shadcn

**Files:**
- Create: `packages/frontend/src/components/ui/emoji-picker.tsx` (generated by CLI)
- Modify: `packages/frontend/package.json` (deps added by CLI)

- [ ] **Step 1: Install**

Run from inside `packages/frontend`:

```bash
cd packages/frontend && bunx shadcn@latest add https://frimousse.liveblocks.io/r/emoji-picker
```

Accept whatever the CLI suggests. The file lands at `packages/frontend/src/components/ui/emoji-picker.tsx` (or wherever the shadcn alias points). It will pull `frimousse` as a dependency.

- [ ] **Step 2: Sanity-check the generated component**

Read the generated file. Confirm it exports composable parts (e.g., `<EmojiPicker.Root>`, `<EmojiPicker.Search>`, `<EmojiPicker.Viewport>`, `<EmojiPicker.List>`). Note the export name(s) — they'll be used in Task E1.

- [ ] **Step 3: Type-check frontend**

Run: `bun run --filter @projectproject/frontend typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/ui/emoji-picker.tsx packages/frontend/package.json packages/frontend/bun.lock
git commit -m "feat(frontend): add Frimousse emoji picker via shadcn registry"
```

---

## Phase E — ProjectIdentityEditor component

### Task E1: Build the combined popover component

**Files:**
- Create: `packages/frontend/src/components/ProjectIdentityEditor.tsx`

- [ ] **Step 1: Add the i18n keys we'll consume**

Add to `packages/frontend/messages/en/projects.json` (alphabetical inside the `project_` prefix group):

```json
{
  "project_identity_aria_label": "Change project icon and color",
  "project_identity_emoji_aria_label": "Pick an emoji icon",
  "project_identity_error": "Could not save — try again."
}
```

Add to `packages/frontend/messages/en/common.json` under a new prefix grouping:

```json
{
  "emoji_search_placeholder": "Search emoji"
}
```

(Run paraglide's codegen if it doesn't auto-watch: `bun run --filter @projectproject/frontend paraglide:compile` or whatever the project uses.)

- [ ] **Step 2: Write the component**

Create `packages/frontend/src/components/ProjectIdentityEditor.tsx`:

```tsx
import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Popover as RadixPopover } from "radix-ui"
import { useState, type ReactNode } from "react"
import { OUTER_RING } from "@projectproject/shared"
import { updateProjectAtom, projectKey } from "@/atoms/projects"
import { ColorPicker } from "@/components/ColorPicker"
import { EmojiPicker } from "@/components/ui/emoji-picker"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Props = {
  orgSlug: string
  slug: string
  icon: string
  color: string
  canEdit: boolean
  size?: "header" | "settings"
}

export function ProjectIdentityEditor({
  orgSlug,
  slug,
  icon,
  color,
  canEdit,
  size = "header"
}: Props) {
  const key = projectKey(orgSlug, slug)
  const update = useAtomSet(updateProjectAtom(key))
  const updateState = useAtomValue(updateProjectAtom(key))
  const waiting = updateState.waiting
  const error = Result.isFailure(updateState)
  const [open, setOpen] = useState(false)

  const sizeClass =
    size === "header" ? "size-10 text-xl" : "size-12 text-2xl"

  const tile = (
    <span
      style={{ backgroundColor: color }}
      className={cn(
        "grid place-items-center rounded-lg shadow-sm leading-none",
        sizeClass,
        waiting && "animate-pulse"
      )}
    >
      <span aria-hidden>{icon}</span>
    </span>
  )

  if (!canEdit) {
    return <div className={size === "header" ? "-mt-1 shrink-0" : "shrink-0"}>{tile}</div>
  }

  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>
        <button
          type="button"
          aria-label={m.project_identity_aria_label()}
          className={cn(
            size === "header" ? "-mt-1 shrink-0" : "shrink-0",
            "rounded-lg outline-none transition-transform duration-100 hover:scale-[1.04] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          {tile}
        </button>
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          className="z-50 flex gap-4 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-md outline-none"
        >
          <div className="flex flex-col items-center justify-start gap-2 pt-2">
            <ColorPicker
              value={color}
              onChange={(next) => update({ color: next })}
              closeOnSelect={false}
              ariaLabel={m.color_picker_aria_label()}
            />
          </div>
          <div className="flex w-[320px] flex-col">
            <EmojiPicker.Root
              onEmojiSelect={({ emoji }) => update({ icon: emoji })}
              className="flex h-[320px] flex-col"
            >
              <EmojiPicker.Search
                placeholder={m.emoji_search_placeholder()}
                aria-label={m.project_identity_emoji_aria_label()}
              />
              <EmojiPicker.Viewport className="flex-1 overflow-auto">
                <EmojiPicker.List />
              </EmojiPicker.Viewport>
            </EmojiPicker.Root>
            {error ? (
              <div role="alert" className="mt-2 text-xs text-destructive">
                {m.project_identity_error()}
              </div>
            ) : null}
          </div>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  )
}
```

Notes for the implementer:
- The exact JSX for `<EmojiPicker.*>` parts depends on what the shadcn-generated file exports (see Task D2 Step 2). Adapt accordingly — the contract is "render a search input + scrollable emoji list, get a callback when one is picked."
- The `Popover` import path: check existing popover usage in the frontend (e.g. `ColorPicker` doesn't use Radix Popover — it rolls its own). Use whatever popover primitive shadcn provides in this repo: look for `popover.tsx` under `components/ui/`. If shadcn's `<Popover>` exists, use that instead of importing radix-ui directly.

  Run: `cat packages/frontend/src/components/ui/popover.tsx | head -20` to confirm. If it exists, use `import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"` and adapt the JSX.

- [ ] **Step 3: Type-check frontend**

Run: `bun run --filter @projectproject/frontend typecheck`
Expected: PASS. Iterate on import paths and component shapes until it compiles.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/ProjectIdentityEditor.tsx packages/frontend/messages/en/projects.json packages/frontend/messages/en/common.json
git commit -m "feat(frontend): combined project identity popover (emoji + color)"
```

---

## Phase F — Wire identity into project header and settings

### Task F1: Integrate ProjectIdentityEditor into the project header

**Files:**
- Modify: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/route.tsx:169–202`

- [ ] **Step 1: Replace the hard-coded tile**

In `ProjectHeader` (around line 169), replace the leading `<div>` (currently `<div className="-mt-1 grid size-10 ...">` with `<FolderKanban />` inside) with `<ProjectIdentityEditor>`:

```tsx
function ProjectHeader({
  orgSlug,
  slug,
  name,
  project
}: {
  orgSlug: string
  slug: string
  name: string
  project: ProjectDetailType
}) {
  const { role: myRole } = useProjectRole()
  const canEdit = myRole === "owner" || myRole === "admin"

  return (
    <header className="flex items-start gap-3">
      <ProjectIdentityEditor
        orgSlug={orgSlug}
        slug={slug}
        icon={project.icon}
        color={project.color}
        canEdit={canEdit}
        size="header"
      />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <NameField orgSlug={orgSlug} slug={slug} name={name} />
        <ActiveSprintLine orgSlug={orgSlug} slug={slug} />
      </div>
      <div className="flex items-center gap-3">
        <GithubChip
          orgSlug={orgSlug}
          slug={slug}
          github={project.github}
          callerRole={myRole}
        />
        <ProjectMenu orgSlug={orgSlug} slug={slug} />
      </div>
    </header>
  )
}
```

Add the import at the top:

```ts
import { ProjectIdentityEditor } from "@/components/ProjectIdentityEditor"
```

Remove the now-unused `FolderKanban` from the lucide-react import if no other usage in this file (there are other usages — check; leave the import if so).

- [ ] **Step 2: Type-check frontend**

Run: `bun run --filter @projectproject/frontend typecheck`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Start the FE dev server. Open `/orgs/project-project/projects/project-project`. Expected:
- Project header shows the project's emoji on a colored background tile (sized `size-10`).
- Click the tile → popover opens with ColorPicker disc on the left and Frimousse on the right.
- Click an emoji → header tile flips instantly to the new emoji (optimistic). Tile shows `animate-pulse` until the server confirms.
- Click a color swatch (the orbit ring) → same. Popover stays open after each pick.
- Click outside the popover → it closes.
- Hover on the tile → slight scale up + transition (per memory `feedback_button_press_scale.md`).
- Active press feel works.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/route.tsx
git commit -m "feat(frontend): project header tile opens combined identity popover"
```

---

### Task F2: Integrate ProjectIdentityEditor into settings General

**Files:**
- Modify: `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/settings/general.tsx`

- [ ] **Step 1: Add an Icon & color row above the name input**

In `general.tsx`, inside the first `<section>` (the one containing the name form), add a sibling block above the form. The component is the same as in the header — the only difference is `size="settings"`.

```tsx
<section className="flex flex-col gap-4">
  <div className="grid gap-2">
    <span className="text-sm font-medium">{m.project_settings_identity_label()}</span>
    <ProjectIdentityEditor
      orgSlug={orgSlug}
      slug={project.slug}
      icon={project.icon}
      color={project.color}
      canEdit={canEdit}
      size="settings"
    />
  </div>
  <form onSubmit={onNameSubmit} className="grid gap-2">
    {/* ... existing name form ... */}
  </form>
  {/* ... existing key section ... */}
</section>
```

Add to imports:

```ts
import { ProjectIdentityEditor } from "@/components/ProjectIdentityEditor"
```

- [ ] **Step 2: Add the missing i18n key**

Add to `packages/frontend/messages/en/projects.json`:

```json
{ "project_settings_identity_label": "Icon & color" }
```

(Place inside the `project_settings_` group, alphabetically.)

- [ ] **Step 3: Type-check frontend**

Run: `bun run --filter @projectproject/frontend typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Navigate to `/orgs/project-project/projects/project-project/settings/general`. Expected:
- Above the Name field is a labeled "Icon & color" row with a clickable tile (or read-only tile for non-owner/admin).
- Click → same popover as the header. Tile is rendered at `size-12` (larger) to fit the settings layout.
- Updates flip instantly here too, and the header tile (if you have a second tab on the project) would also flip — but inside settings, the header isn't rendered.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/settings/general.tsx packages/frontend/messages/en/projects.json
git commit -m "feat(frontend): settings General has icon + color row"
```

---

## Phase G — Sidebar projects group

### Task G1: Build the ProjectsGroup component inside the authed route

**Files:**
- Modify: `packages/frontend/src/routes/_authed/route.tsx`

- [ ] **Step 1: Add the new component and replace the Projects NavItem**

In `packages/frontend/src/routes/_authed/route.tsx`, the current `PrimaryNav` renders a Projects `<NavItem>`. We'll replace it with a `<ProjectsGroup>` that renders the route-driven group.

Add new imports near the top:

```ts
import { Result, useAtomValue } from "@effect-atom/atom-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { projectsListAtom } from "@/atoms/projects"
```

(`useAtomValue` and `Result` may already be imported — check and dedupe.)

Replace the body of `PrimaryNav`:

```tsx
function PrimaryNav({ orgSlug }: { orgSlug: string | null }) {
  return (
    <nav className="flex flex-col gap-1 px-3 py-2">
      {orgSlug ? (
        <NavItem
          to="/orgs/$orgSlug"
          params={{ orgSlug }}
          icon={LayoutDashboard}
          label={m.chrome_sidebar_dashboard()}
          exact
        />
      ) : (
        <NavItem
          to="/"
          icon={LayoutDashboard}
          label={m.chrome_sidebar_dashboard()}
          exact
        />
      )}
      {orgSlug && <ProjectsGroup orgSlug={orgSlug} />}
    </nav>
  )
}
```

Add the `ProjectsGroup` component below `PrimaryNav`:

```tsx
function ProjectsGroup({ orgSlug }: { orgSlug: string }) {
  const { pathname } = useLocation()
  const reduceMotion = useReducedMotion()
  const expanded = pathname.startsWith(`/orgs/${orgSlug}/projects`)
  const listResult = useAtomValue(projectsListAtom(orgSlug))
  const projects = Result.isSuccess(listResult)
    ? [...listResult.value].toSorted((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      )
    : []
  const activeSlug = matchActiveProjectSlug(pathname, orgSlug)

  return (
    <div
      className={cn(
        "rounded-lg transition-colors",
        expanded && "bg-accent"
      )}
    >
      <NavItem
        to="/orgs/$orgSlug/projects"
        params={{ orgSlug }}
        icon={FolderKanban}
        label={m.chrome_sidebar_projects()}
      />
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="projects-list"
            initial={
              reduceMotion ? false : { height: 0, opacity: 0 }
            }
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{
              duration: 0.2,
              ease: [0.2, 0.8, 0.2, 1]
            }}
            className="overflow-hidden"
          >
            <ul className="flex flex-col gap-0.5 px-2 pb-2">
              {projects.map((p) => (
                <ProjectsGroupRow
                  key={p.slug}
                  orgSlug={orgSlug}
                  slug={p.slug}
                  name={p.name}
                  icon={p.icon}
                  color={p.color}
                  active={p.slug === activeSlug}
                />
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function ProjectsGroupRow({
  orgSlug,
  slug,
  name,
  icon,
  color,
  active
}: {
  orgSlug: string
  slug: string
  name: string
  icon: string
  color: string
  active: boolean
}) {
  return (
    <li>
      <Link
        to="/orgs/$orgSlug/projects/$slug"
        params={{ orgSlug, slug }}
        className={cn(
          "group/proj-row flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
          active
            ? "text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <span
          style={active ? { backgroundColor: color } : undefined}
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-md text-[13px] leading-none transition-colors",
            !active && "bg-muted"
          )}
        >
          <span aria-hidden>{icon}</span>
        </span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </Link>
    </li>
  )
}

function matchActiveProjectSlug(
  pathname: string,
  orgSlug: string
): string | null {
  const prefix = `/orgs/${orgSlug}/projects/`
  if (!pathname.startsWith(prefix)) return null
  const rest = pathname.slice(prefix.length)
  const slug = rest.split("/")[0]
  return slug.length > 0 ? slug : null
}
```

The existing `NavItem`'s `activeProps` will give the Projects header its `bg-accent text-foreground font-medium`. Inside the group's `bg-accent` container, that overlap is fine — the active state on the Projects header just looks like "you're here in the group anchor."

- [ ] **Step 2: Type-check frontend**

Run: `bun run --filter @projectproject/frontend typecheck`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Start (or refresh) the FE dev server.

- Navigate to `/orgs/project-project` (Dashboard). Expected: sidebar shows Dashboard + Projects NavItem only (group collapsed, no bg).
- Click "Projects." Expected: route is `/orgs/project-project/projects`. Group animates open (height + fade ~200ms). The Projects nav anchor still has its existing active styling. List shows all projects alphabetically, each with their emoji on a `bg-muted` tile (since no project is active yet).
- Click any project row. Expected: route is `/orgs/project-project/projects/<slug>`. That project's emoji tile flips from `bg-muted` to `bg-{projectColor}` (via CSS `transition-colors`). The Projects header still active. Group still expanded.
- Click Dashboard. Expected: group collapses (height shrinks, fade), Projects nav back to inactive.
- Open the project header tile, change emoji. Expected: sidebar row's emoji flips instantly (optimistic via the list cache flip we wired in C1). Then settles after server confirms.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/routes/_authed/route.tsx
git commit -m "feat(frontend): sidebar projects group with route-driven expand"
```

---

## Phase H — Polish and verification

### Task H1: i18n consolidation pass

**Files:**
- Modify: `packages/frontend/messages/en/projects.json`
- Modify: `packages/frontend/messages/en/common.json`

- [ ] **Step 1: Ensure messages are alphabetically grouped**

Open both JSON files. The CLAUDE.md rule: within each file, group keys by prefix in the listed order, then alphabetically inside each prefix. Confirm any new keys we added (`project_identity_*`, `project_settings_identity_label`, `emoji_search_placeholder`, `color_picker_aria_label` if missing) sit in the right place. Move them if necessary.

- [ ] **Step 2: Confirm there are no raw literals in our new JSX**

Run: `grep -rEn '"[A-Z][a-z]' packages/frontend/src/components/ProjectIdentityEditor.tsx packages/frontend/src/routes/_authed/route.tsx`

Most matches will be aria attributes pointing at `m.*` — that's fine. Look for anything that's a literal user-facing string (e.g., a placeholder, a label, an aria-label). If any are raw, replace with `m.<key>()`.

- [ ] **Step 3: Compile paraglide messages**

Run: `bun run --filter @projectproject/frontend paraglide:compile` (or whatever the project's command is — check `packages/frontend/package.json` scripts).

- [ ] **Step 4: Type-check frontend**

Run: `bun run --filter @projectproject/frontend typecheck`
Expected: PASS.

- [ ] **Step 5: Commit (if any changes)**

```bash
git add packages/frontend/messages
git commit -m "chore(frontend): tidy identity-related i18n placement"
```

(Skip if nothing changed.)

---

### Task H2: Full manual verification checklist

This task is the final pre-PR sanity sweep. Hand the checklist to the user (per the `feedback_no_playwright.md` memory — Claude does NOT drive Playwright; just runs the dev server and asks for verification).

- [ ] **Step 1: Ensure backend + frontend dev servers are running**

Whatever commands Wouter uses. Note the URL.

- [ ] **Step 2: Walk through the checklist**

Ask Wouter to verify each item, and check off as confirmed:

- [ ] As an owner: project header shows the project's emoji on its colored tile. Click → popover opens with ColorPicker (orbit disc) on left, Frimousse (search + grid) on right.
- [ ] As an owner: clicking an emoji flips the header tile instantly. Sidebar row's emoji flips instantly too (if the projects group is expanded).
- [ ] As an owner: clicking a color swatch in the orbit ring flips both surfaces instantly. The orbit stays open after pick.
- [ ] As an owner: outside-click and Esc both close the outer popover.
- [ ] As an owner: while the optimistic flip is in flight, the header tile (and sidebar tile) shows `animate-pulse`.
- [ ] As an owner: if you forcibly fail the request (e.g., set the backend offline, or use devtools to fault the fetch), the inline error message appears at the bottom of the popover and the icon snaps back.
- [ ] As a member (not owner/admin): the header tile is a non-interactive display — no popover opens, no hover scale, no aria-label suggesting it's interactive.
- [ ] Settings → General: the "Icon & color" tile (larger, `size-12`) opens the same popover. Editing here flips the header tile (when you navigate away to the project view), the sidebar row, and the tile itself.
- [ ] Sidebar group: navigating to `/orgs/project-project` (Dashboard) collapses the projects group. Navigating to `/orgs/project-project/projects` expands it with the 200ms height+fade.
- [ ] Sidebar group: while inside a project (`/projects/foo`), the foo row's icon tile is colored (`bg-{fooColor}`); all other rows are neutral (`bg-muted`); foo row's text is `text-foreground font-medium`; others are `text-muted-foreground`.
- [ ] Sidebar group: switching between two projects swaps the colored tile from one row to the other via CSS transition-colors; no layout jump.
- [ ] Sidebar group: list is alphabetical by name, all projects shown (no limit).
- [ ] Migration: open `data/projects/project-project/project-project/project.md` in the bind-mount. After any project update lands, the frontmatter contains `icon:` and `color:` lines that match the DB.
- [ ] Determinism: deleting and recreating a project with the same slug yields the same icon + color (smoke this with a throwaway project create → delete → recreate).
- [ ] No new console errors. No paraglide warnings about missing keys.

- [ ] **Step 3: If anything fails, file fixes**

Diagnose and patch. Stay TDD-y where possible — the schema, atom, and resolver changes have tests; UI fixes are diff-then-verify.

---

### Task H3: PR readiness

**Files:**
- (none — git operations)

- [ ] **Step 1: Run all tests + type-checks one final time**

```bash
bun run typecheck
bun test
```

Expected: all green.

- [ ] **Step 2: Check the diff is sane**

```bash
git diff main --stat
```

Expected: changes confined to the files in the "File structure" section above. No surprise edits.

- [ ] **Step 3: Push**

```bash
git push -u origin feat/T-75-project-customization
```

- [ ] **Step 4: Open the PR**

Use the `commit-commands:commit-push-pr` skill or `gh pr create` — confirm with Wouter before opening if unsure. PR title: `feat(projects): customizable emoji + color identity and sidebar projects group (T-75)`.

PR description should reference T-75 and call out:
- Schema migration with deterministic backfill
- Optimistic update across header / sidebar / settings
- Route-driven sidebar group (no manual expand state)
- Permissions: owner+admin only
- New dependency: `frimousse` via shadcn

---

## Self-review notes

After the implementer finishes Phase H, they should re-check:

1. **Spec coverage:** Icon + color: yes (Phase A–F). Sidebar group with bg-accent wrap + active-color tile + animation: yes (Phase G). Optimism: yes (Phase C). Permissions: yes (Task F1 Step 1, Task F2 Step 1). Frontmatter persistence: yes (Phase B). Determinism: yes (Task A1, B1 backfill). i18n: yes (Phase E + H1).
2. **No placeholders:** every step has code or a concrete command.
3. **Type consistency:** `deriveProjectIdentity` is the single resolver name used in B1 (SQL inline), B2 (frontmatter fallback), B3 (create). `closeOnSelect` is the prop name in D1 and E1. `ProjectIdentityEditor` is the component name in E1, F1, F2. `projectsListBaseAtom` / `projectsListAtom` split is in C1 and consumed in G1.
4. **Commit cadence:** ~10 small commits. Frequent enough that a rollback at any point leaves the tree consistent (with the exception of B2 → B3 which intentionally land together to keep the backend compiling).
