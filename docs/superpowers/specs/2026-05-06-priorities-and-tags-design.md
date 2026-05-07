# Priorities & Tags — Design

**Date:** 2026-05-06
**Status:** Approved, ready for implementation plan
**Spec context:** Net-new feature, additive to ticket model. Sets the precedent for tag handling that Phase 7 (Documentation) will reuse.

## Goal

Give tickets two new dimensions:

1. **Priority** — a required `low | med | high` field, default `med`, sortable in the ticket list.
2. **Tags** — a project-scoped registry of named, colored tags that can be applied to tickets (and, in Phase 7, to docs). Frontmatter holds the applied tag *names* as a string array.

## Scope

In scope:

- Required `priority` on every ticket. Backwards-compat default `med` for existing tickets.
- Project-scoped tag registry stored in Postgres (`project_tag` table).
- Multiple tags per ticket via frontmatter `tags: [string]`.
- Owner/admin-only CRUD on tag *definitions*. Any member can apply existing tags.
- Tag rename rewrites every ticket frontmatter that references the old name.
- Tag delete fails with a typed `TagInUse` error listing the affected tickets unless `force=true` is passed; with force, it scans-and-strips.
- Priority column (sortable, colored chip) on the ticket list table.
- Priority editor on ticket detail using the existing `SegmentedTabs` pattern.
- Inline tag editor on ticket detail with autocomplete against the project tag registry.
- Tag filter integrated into the existing filter/sort dropdown above the ticket list.
- Tag administration UI on the project settings surface (owner/admin only).

Out of scope:

- Tags column on the ticket list (intentional — too cluttered).
- Tag groups, hierarchical tags (`auth/oauth`), or tag categories.
- Tag-based board / kanban views.
- Auto-suggesting tags from ticket titles.
- File locking around the rename/delete walks (see "Concurrency").
- Tag application on docs (Phase 7 will reuse the registry; ticket-only for now).

## Data Model

### Ticket frontmatter (additive)

```yaml
priority: med           # required: low | med | high. Default 'med'.
tags: [auth, frontend]  # optional string array. Defaults to [].
```

Existing tickets without `priority` decode as `med` via Schema default — no migration script required, but we may add a one-shot rewriter to normalize files on disk later.

### Postgres `project_tag`

```ts
export const projectTag = pgTable("project_tag", {
  projectId: uuid("project_id").notNull()
    .references(() => projectIndex.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull().defaultNow()
}, (t) => [primaryKey({ columns: [t.projectId, t.name] })])
```

- `name` is lowercase, regex `^[a-z0-9][a-z0-9-]{0,30}$`. Schema-validated at the API boundary.
- `color` is a hex string `#rrggbb`. Auto-assigned on create from a curated palette; admin-editable.
- `(projectId, name)` is the primary key — name is unique per project, allowed to repeat across projects.

### Source-of-truth split

- **Tag definitions** (existence, color): `project_tag` table.
- **Tag usage** (which ticket has which tag): ticket frontmatter `tags`.

Frontmatter strings are **not** validated against the registry on write. A ticket may reference a tag that no longer exists in the registry; it renders neutral grey (same tolerance as the docs spec calls out for `_meta.json`). This keeps writes fast, allows fearless tag deletion, and matches the docs-spec philosophy.

## Schemas

`packages/shared/src/schemas/Ticket.ts`:

```ts
export const TicketPriority = Schema.Literal("low", "med", "high")
export type TicketPriority = typeof TicketPriority.Type

// Added to Ticket struct:
priority: TicketPriority,
tags: Schema.Array(Schema.String)

// UpdateTicketInput gains:
priority: Schema.optional(TicketPriority),
tags: Schema.optional(Schema.Array(Schema.String))  // full replace, not patch
```

`packages/shared/src/schemas/Tag.ts` (new):

```ts
export const TagName = Schema.String.pipe(
  Schema.pattern(/^[a-z0-9][a-z0-9-]{0,30}$/),
  Schema.brand("TagName")
)

export const TagColor = Schema.String.pipe(
  Schema.pattern(/^#[0-9a-f]{6}$/i),
  Schema.brand("TagColor")
)

export const Tag = Schema.Struct({
  name: TagName,
  color: TagColor,
  createdBy: Schema.String,
  createdAt: Schema.Date
})

export const CreateTagInput = Schema.Struct({
  name: TagName,
  color: Schema.optional(TagColor)
})

export const UpdateTagInput = Schema.Struct({
  name: Schema.optional(TagName),
  color: Schema.optional(TagColor)
})
```

`packages/shared/src/errors.ts` — new tagged error:

```ts
export class TagInUse extends Schema.TaggedError<TagInUse>()("TagInUse", {
  tagName: Schema.String,
  usages: Schema.Array(Schema.Struct({
    ticketId: TicketId,
    title: Schema.String
  }))
}) {}
```

## API Surface

New `tags` group on `AppApi`:

```ts
const Tags = HttpApiGroup.make("tags")
  .add(HttpApiEndpoint.get("list", "/projects/:slug/tags")
    .setPath(S.Struct({ slug: S.String }))
    .addSuccess(S.Array(Tag))
    .addError(NotFound).addError(Forbidden))

  .add(HttpApiEndpoint.post("create", "/projects/:slug/tags")
    .setPath(S.Struct({ slug: S.String }))
    .setPayload(CreateTagInput)
    .addSuccess(Tag)
    .addError(Conflict).addError(Forbidden).addError(NotFound))

  .add(HttpApiEndpoint.patch("update", "/projects/:slug/tags/:name")
    .setPath(S.Struct({ slug: S.String, name: TagName }))
    .setPayload(UpdateTagInput)
    .addSuccess(Tag)
    .addError(NotFound).addError(Conflict).addError(Forbidden))

  .add(HttpApiEndpoint.del("delete", "/projects/:slug/tags/:name")
    .setPath(S.Struct({ slug: S.String, name: TagName }))
    .setUrlParams(S.Struct({ force: S.optional(S.Boolean) }))
    .addSuccess(S.Void)
    .addError(NotFound).addError(Forbidden).addError(TagInUse))
```

The `Tickets` group's existing `update` endpoint gains `priority` and `tags` via the updated `UpdateTicketInput` — no new endpoints needed for ticket-side mutations.

## Backend

### `Tags` service

```ts
export class Tags extends Context.Tag("Tags")<Tags, {
  readonly list: (slug: string, userId: string) =>
    Effect.Effect<readonly Tag[], NotFound | Forbidden>

  readonly create: (slug: string, input: CreateTagInput, userId: string) =>
    Effect.Effect<Tag, Conflict | Forbidden | NotFound>

  readonly update: (slug: string, name: string, patch: UpdateTagInput, userId: string) =>
    Effect.Effect<Tag, NotFound | Conflict | Forbidden>

  readonly remove: (slug: string, name: string, force: boolean, userId: string) =>
    Effect.Effect<void, NotFound | TagInUse | Forbidden>
}>() {}
```

Implementation notes:

- `create` — auto-assigns color when omitted by picking the next unused hue from a fixed palette (round-robin if all are used). Validates name uniqueness via the primary key constraint and maps the `unique_violation` to `Conflict`.
- `update` — when `name` changes, runs `rewriteTagInTickets(slug, oldName, newName)` after the row update, in a single transaction. Color-only changes skip the walk.
- `remove`:
  - Always scans tickets for usages first (`scanTagUsages(slug, name)`).
  - If usages exist and `!force`: fail with `TagInUse(name, usages)`. No mutation.
  - If `force` or no usages: `rewriteTagInTickets(slug, name, null)` (strip), then delete the registry row. Both in a transaction.
- `scanTagUsages(slug, name)` — walks `<projectsDir>/orgs/<org>/projects/<slug>/tickets/*.md`, parses frontmatter, returns `{ ticketId, title }[]` for tickets whose `tags` includes `name`.
- `rewriteTagInTickets(slug, oldName, newName | null)` — same walk; for each match, replace (or remove if `null`) the tag string and write the file back. Returns void.
- All four methods perform a permission check at the top: read uses `requireMember`, writes use `requireAdmin` (owner or admin role).

### `Tickets` service

The existing `update` method accepts `priority` and `tags` as additional optional fields on its patch input. No registry validation on write — orphan tag strings are tolerated.

### Permission helpers

Reuse the existing role-check helper added during the org/members work. `requireAdmin(slug, userId)` returns `Forbidden` for plain members.

### Concurrency

Rename and delete walks are sequential and bounded by project size. No file locks. If a member writes a ticket body during a rename, the loser's write may overwrite the rename's tag substitution on that one file. Acceptable for a homelab tool. Documented as a known limitation; revisit if it bites.

## Frontend

### Atoms (`atoms/tags.ts`, new)

Standard Effect-Atom optimistic shape, mirroring `atoms/github.ts`:

```ts
const tagsBaseAtom = Atom.family((slug: string) =>
  runtime.atom(/* fetch list */).pipe(Atom.setIdleTTL("2 minutes"))
)

export const tagsAtom = Atom.family((slug: string) =>
  Atom.optimistic(tagsBaseAtom(slug))
)

export const createTagAtom = Atom.family((slug: string) =>
  Atom.optimisticFn(tagsAtom(slug), {
    reducer: (current, input) => {
      if (!Result.isSuccess(current)) return current
      return Result.success([...current.value, optimisticTag(input)], { waiting: true })
    },
    fn: runtime.fn(Effect.fn(function* (input, get) {
      const tag = yield* api.tags.create({ path: { slug }, payload: input })
      get.refresh(tagsBaseAtom(slug))
      return tag
    }))
  })
)

// renameTagAtom: pulse-only reducer (the rename touches tickets too — easier
// to flip the pulse and refresh both the registry and the affected tickets
// than to model the synthetic next state).
// deleteTagAtom: same pattern. Surfaces TagInUse to the form layer when !force.
```

Rename and delete refresh both `tagsBaseAtom(slug)` and the ticket-list base atom for the project, since they touch ticket frontmatter.

### Atoms (`atoms/tickets.ts`, extension)

The existing `updateTicketAtom` already accepts an arbitrary patch. Extending its reducer to handle `priority` / `tags` swaps is mechanical — same shape as `status` and `assignees`.

### UI surfaces

- **Ticket list table:**
  - New `Priority` column. Renders a colored chip (`high` → red-500, `med` → amber-500, `low` → slate-400). Sortable by ordinal (high → low). Width is icon-shaped — short labels.
  - **No tags column.** Per Wouter's call: tags only visible on ticket detail.
  - The existing **filter/sort dropdown** above the table gets a **Tags** filter section: multi-select tag chips. Selecting two tags filters to tickets carrying *all* selected tags (AND, not OR; matches user expectation when narrowing). Empty selection = no filter.

- **Ticket detail:**
  - Priority editor: `SegmentedTabs` "Update priority to: [low | med | high]" right next to the existing status segmented control. Same `variant="inline"` chrome.
  - Inline tag editor below the title:
    - Chip row: each applied tag rendered with its registry color (or neutral grey if orphan).
    - Trailing input: type-to-add, autocompletes against `tagsAtom(slug)`. Backspace on empty input removes the last chip.
    - On Enter with a non-existing string:
      - If user is owner/admin: shows "+ Create tag '`foo`'" affordance. Clicking creates the tag (default color) AND applies it to the current ticket.
      - If user is member: no-op + a soft hint ("Only admins can create new tags").
    - Click on a chip removes it from the ticket (after a brief intent affordance — matches existing chip patterns).
  - Both editors use the same optimistic update + pulse-while-waiting pattern as everything else.

- **Project settings → Tags section** (owner/admin only):
  - Inline list of tags. Each row: color swatch (clickable to recolor via inline picker), name (click-to-rename inline), usage count, delete button.
  - Inline create row at top: name input + "Create" button. Default color auto-assigned; click swatch to override before creating.
  - Delete button:
    - Optimistic call WITHOUT `force` first.
    - On `TagInUse`: shows inline warning under the row — "Used on 3 tickets: [T-12 title], [T-19 title], [T-44 title]. Delete anyway?" with a confirmation button that retries with `force=true`.
    - On success: row disappears optimistically.
  - This section lives wherever the project settings already render (members, github connection). If no settings page exists, this design adds the minimum scaffolding for one — to be confirmed with Wouter during planning if there's an existing settings surface to extend.

### Variants over local styling

Per CLAUDE.md, the priority chip is a **variant** on the existing chip primitive, not a one-off styled component. Same goes for the tag chip — likely a new `variant="tag"` (or a tiny `TagChip` wrapper around the chip primitive) that takes a `color` prop. If extending the chip primitive feels disruptive, ask before going local.

## Migration & rollout

- Drizzle migration adds `project_tag`. No data backfill needed (table starts empty per project).
- No ticket-frontmatter migration needed; Schema default fills in `priority: med` on read.
- Optional one-shot script `relayout-priority.ts` that walks every ticket and writes `priority: med` explicitly to disk so files are self-describing. Nice-to-have, not blocking.

## Testing

Per the project's "one representative test per layer" stance:

- **Service test:** `Tags.remove` with `force=false` returns `TagInUse` carrying expected usages; with `force=true` it strips frontmatter and removes the row. Use a fake `Markdown` layer.
- **Service test:** `Tags.update` with a name change rewrites the affected tickets' frontmatter.
- **Repository test:** `project_tag` unique constraint on `(projectId, name)` maps to `Conflict`.
- **Frontend test:** the inline tag editor on ticket detail renders applied chips, autocompletes, and triggers the optimistic refresh on add/remove.

## Things deliberately out of scope (recap)

- Tag groups / categories
- Tag-based board / kanban views
- Hierarchical tags
- Auto-suggested tags
- Tags column on the ticket list
- File locking on rename/delete walks
- Doc-side tag application (Phase 7 reuses the registry)

## Open questions for planning

- Does an "owner/admin project settings" surface already exist to host the Tags section, or does this design need to scaffold one? Resolve at the top of the implementation plan by reading the current routes tree.
- Color palette: pick one during implementation. Lucide-friendly hues that play well with the existing chip styling. If indecision drags, ask before locking it in.
