# Comments + Mentions — Design (T-19)

Date: 2026-05-07
Branch: `feat/T-19-comments`
Status: Approved (pending user review of written spec)

---

## Goal

Add comments to tickets, markdown-first like the rest of the app, and ship a reusable mention system that supports `@user` and `#ticket` today and extends to other entities (e.g. docs) without changing the storage format.

Out of scope for this spec: notifications, mention-driven inbox, threading/replies, attachments, real-time sync.

---

## Storage — comments live inside the ticket file

Each ticket's markdown is self-contained: description on top, comments region appended below a stable HTML-comment marker. Lexical and the description endpoint never see the comments region; the comments service never sees the description.

```markdown
---
id: T-12
title: Add primary button component
status: in_progress
…
---

# Add primary button component

Description body in markdown. Lexical reads/writes only this region.

<!-- comments:start -->
<!-- comment:c_01HX… -->
---
author: github_42
createdAt: 2026-05-07T10:00:00Z
editedAt: 2026-05-07T10:04:11Z
---
Looks good. cc [Wouter](mention:user/github_88) — does this need a story in
[T-15](mention:ticket/T-15)?

<!-- comment:c_01HX… -->
---
author: github_88
createdAt: 2026-05-07T10:06:30Z
---
Yep, on it.
<!-- comments:end -->
```

Rules:

- HTML-comment delimiters (`<!-- comments:start -->`, `<!-- comments:end -->`, `<!-- comment:<id> -->`) are invisible in any rendered markdown view (GitHub preview, AI ingestion, plain readers).
- The description region = everything between the ticket frontmatter and `<!-- comments:start -->`. The comments region = everything between `<!-- comments:start -->` and `<!-- comments:end -->`. A ticket with zero comments has no markers at all.
- Per-comment frontmatter is a standard `---`-fenced YAML block, parsed with the same library as the ticket frontmatter.
- Comment IDs are `c_<ulid>` — sortable, generated server-side, never reused.
- Comment bodies are validated at write time with a single regex (`/<!--\s*comment(s)?:/`) — any match rejects the write with a validation error. This keeps the parser unambiguous without needing escape handling. Bodies containing `---` are fine — the parser only treats `---` as a frontmatter boundary when it's the first non-blank line immediately after a `<!-- comment:<id> -->` marker.

### Forging is structurally impossible

The description endpoint slices the file at `<!-- comments:start -->` and returns only the prefix; the comments endpoint reads only the suffix. A user typing fake `<!-- comment:* -->` markers into their description region cannot inject comments — those markers live in a region the description writer rewrites verbatim and the comments parser never reads.

---

## Postgres index — `comment_index`

Single new table, mirroring the `project_index` pattern. No body column; markdown is the source of truth.

```ts
// packages/backend/src/db/schema.ts
export const commentIndex = pgTable("comment_index", {
  id: text("id").primaryKey(),                         // c_<ulid>
  projectSlug: text("project_slug").notNull(),
  ticketId: text("ticket_id").notNull(),
  authorId: text("author_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
}, (t) => ({
  ticketIdx: index().on(t.projectSlug, t.ticketId, t.createdAt),
}))
```

### Read path — DB is the authoritative list

1. Query `comment_index` for `(projectSlug, ticketId)` ordered by `createdAt`.
2. Parse the ticket file's comments region into a map of `commentId → { author, body, createdAt, editedAt }`.
3. Join in DB order, **drop anything not in the index**, and on conflict trust the DB (`authorId`, `createdAt`, `editedAt` come from postgres; only `body` comes from the file).
4. Forged blocks (someone hand-edited the file with a fake comment) are silently filtered.

### Write path — DB + file in one Effect scope

- **Create:** generate `commentId`, insert row, append block to file. FS failure → DB row rolled back via Effect finalizer (same pattern as projects/tickets services).
- **Edit:** verify `authorId === currentUser.id` against the row, update `editedAt`, rewrite the matching block in the file. Author mismatch → `Forbidden`.
- **Delete (hard):** verify author, `DELETE FROM comment_index`, rewrite the file omitting that block. Git history preserves the prior content if anyone needs it.

---

## HttpApi surface

Three endpoints under a new `TicketComments` group, scoped by the existing project-membership middleware:

```
GET    /projects/:slug/tickets/:ticketId/comments
POST   /projects/:slug/tickets/:ticketId/comments                       body: { body }
PATCH  /projects/:slug/tickets/:ticketId/comments/:commentId            body: { body }
DELETE /projects/:slug/tickets/:ticketId/comments/:commentId
```

Errors: `NotFound` (ticket or comment), `Forbidden` (non-author edit/delete). Project access denial is already handled upstream.

`Comment` schema in `packages/shared/src/schemas/Comment.ts`:

```ts
export class Comment extends Schema.Class<Comment>("Comment")({
  id: Schema.String,
  ticketId: Schema.String,
  projectSlug: Schema.String,
  author: User,                       // resolved server-side from authorId
  body: Schema.String,                // raw markdown, mention links intact
  createdAt: Schema.DateTimeUtc,
  editedAt: Schema.NullOr(Schema.DateTimeUtc),
}) {}
```

The body is sent as raw markdown; the frontend renders it via the existing `Markdown.tsx` and Lexical paths. Mentions stay as `[label](mention:type/id)` links on the wire.

### Backend layout

- `packages/backend/src/services/Comments.ts` — `list / create / edit / delete`. Depends on `Db`, `Markdown`, `Tickets` (for the file-path resolver).
- `packages/backend/src/handlers/comments.ts` — HttpApi handler wiring.
- File-region parser/serializer lives in `Markdown` service alongside the existing ticket-frontmatter helpers.

---

## Mentions — three layers

The whole point of this section is **modularity**: adding a new mention type later (e.g. docs with `&`) must be one provider entry, no parser changes.

### Layer 1 — Shared registry (no React, no Effect)

`packages/shared/src/mentions.ts`:

```ts
export type MentionType = "user" | "ticket"   // add "doc" later by adding here

export interface MentionRef {
  type: MentionType
  id: string                                    // "github_42" or "T-12"
  label: string                                 // display text in the link
}

export const MENTION_SCHEME = "mention:"        // [label](mention:user/github_42)

export const parseMentionHref = (href: string): Omit<MentionRef, "label"> | null => …
export const formatMentionHref = (type: MentionType, id: string): string => …
```

Single source of truth that backend, frontend, and the markdown renderer all import. No format drift.

### Layer 2 — Frontend provider registry

`packages/frontend/src/mentions/registry.ts`:

```ts
export interface MentionProvider {
  trigger: "@" | "#" | "&" | …                  // single char that opens the typeahead
  type: MentionType                             // what gets serialized
  search: (query: string) => Effect<ReadonlyArray<MentionCandidate>>
  renderRow: (candidate: MentionCandidate) => ReactNode
  renderChip: (ref: MentionRef) => ReactNode    // editor chip + rendered markdown
}

export const mentionProviders: ReadonlyArray<MentionProvider> = [
  userMentionProvider,    // "@" → searches users atom (org-scoped)
  ticketMentionProvider,  // "#" → searches tickets atom (current-project-scoped)
]
```

Adding `doc` later = one new file + one entry. No editor or renderer changes.

### Layer 3 — Lexical integration

- `MentionNode` (`TextNode` subclass) carries `{ type, id, label }`. `createDOM` renders the chip; `exportJSON` / `importJSON` round-trip the ref.
- `MentionsPlugin` uses `LexicalTypeaheadMenuPlugin` with a trigger matcher recognizing any provider's `trigger` char, dispatches to that provider's `search`, and on selection inserts a `MentionNode`.
- Markdown serialization: a custom `Transformer` registered with `@lexical/markdown` serializes `MentionNode → [label](mention:type/id)` and parses any link with a `mention:` href back into a `MentionNode`. Both directions go through `formatMentionHref` / `parseMentionHref`.
- `Markdown.tsx` overrides the link renderer for `mention:`-scheme hrefs and renders `provider.renderChip(ref)` instead of `<a>`.

Net effect:

- Comment editor: type `@` → user list; type `#` → ticket list; selecting either inserts a chip; chip serializes to canonical link on save.
- Comment display: same chip renders, whether through Lexical (read-only mode) or `Markdown.tsx`.
- Ticket descriptions get mentions for free — same plugin, same providers.

---

## Frontend state — atoms + optimistic UX

Following the project's `Atom.optimistic` + `Atom.optimisticFn` pattern from `packages/frontend/src/atoms/github.ts`. New file: `packages/frontend/src/atoms/comments.ts`.

```ts
const commentsBaseAtom = Atom.family((key: TicketKey) =>
  runtime.atom(Effect.gen(function* () {
    const api = yield* ApiClient
    return yield* api.ticketComments.list({ path: key })
  })).pipe(Atom.setIdleTTL("5 minutes"))
)

export const commentsAtom = Atom.family((key: TicketKey) =>
  Atom.optimistic(commentsBaseAtom(key))
)

export const createCommentAtom = Atom.family((key: TicketKey) =>
  Atom.optimisticFn(commentsAtom(key), {
    reducer: (current, input: { body: string }) => {
      if (!Result.isSuccess(current)) return current
      const draft: Comment = {
        id: `c_pending_${crypto.randomUUID()}`,
        ticketId: key.ticketId,
        projectSlug: key.slug,
        author: currentUserSnapshot(),
        body: input.body,
        createdAt: new Date().toISOString(),
        editedAt: null,
      }
      return Result.success([...current.value, draft], { waiting: true })
    },
    fn: runtime.fn(Effect.fn(function* (input, get) {
      const created = yield* api.ticketComments.create({ path: key, body: input })
      get.refresh(commentsBaseAtom(key))
      return created
    })),
  })
)

export const editCommentAtom = Atom.family(…)    // pulse-only reducer (body swap)
export const deleteCommentAtom = Atom.family(…)  // reducer drops the row
```

`TicketKey` = `{ slug, ticketId }`, the family key.

- **Pulse during waiting:** the comment row applies `animate-pulse` while `result.waiting === true`. Idle controls don't pulse — only the data display.
- **Errors:** the form keeps standard `setBusy/setError` plumbing. Server rejection (`Forbidden` on edit/delete) reverts the optimistic state and surfaces the error inline on the row.
- **Always refresh `commentsBaseAtom`** after the mutation lands, never the optimistic wrapper, per the project convention.

---

## UI components

New components in `packages/frontend/src/components/Comments/`:

- `CommentsSection.tsx` — the thread, lives at the bottom of the ticket detail page below the description. Reads `commentsAtom(key)`. Renders `CommentRow` for each.
- `CommentRow.tsx` — author avatar, timestamp, edited indicator, body (Lexical read-only), and an actions menu (edit / delete) visible only when `comment.author.id === currentUser.id`. Buttons follow the press-feel rule (`active:scale-[0.97]`).
- `CommentComposer.tsx` — Lexical editor wired with `MentionsPlugin`, primary "Comment" button, submits to `createCommentAtom`. Lives inline at the bottom of the thread.
- `CommentEditor.tsx` — same Lexical surface in "edit existing comment" mode, swaps in for the row's body when editing. Cancel reverts; Save calls `editCommentAtom`.

Hover and transition rules from `CLAUDE.md` apply throughout (instant-in / 150ms-out, `transition-colors` paired with hover states).

---

## Testing

Following existing patterns (Effect/vitest, layer mocks).

- **Backend service tests** (`Comments.test.ts`):
  - Create → list round-trip through a temp markdown file + test DB layer.
  - Edit by non-author → `Forbidden`.
  - Delete by non-author → `Forbidden`.
  - **Forge test:** write a fake `<!-- comment:fake -->` block directly into the file; assert `list` drops it.
  - **Description-vs-comments isolation test:** write a comments region; assert the description endpoint returns the description without any comment markers.
  - FS write failure during create → DB row rolled back (no orphan in `comment_index`).
- **Markdown parser tests:**
  - Zero comments (no markers at all) round-trips byte-equal.
  - Single + multiple comments round-trip.
  - Body containing `---` round-trips correctly.
  - Body containing `<!-- comment:* -->` is rejected at write time.
- **Shared mentions tests:**
  - `formatMentionHref` / `parseMentionHref` round-trip for all registered types.
  - Malformed hrefs → `null`.
- **Frontend:**
  - Smoke test `MentionsPlugin` insertion via the existing Lexical test harness.
  - Render `Markdown.tsx` with a mention link → assert the chip renders, not an `<a>`.

---

## Migration

One Drizzle migration adding `comment_index`. No data migration needed — comments are a new feature, no existing tickets have a comments region.

---

## Open questions deferred to later specs

- Notifications driven by mentions (the whole point of having a parsed mention registry).
- Threading / replies.
- Attachments on comments.
- Mention-driven inbox / "your mentions" view.
- Indexing mentions in postgres for fast "where am I mentioned?" queries (currently parse-on-read is fine).
