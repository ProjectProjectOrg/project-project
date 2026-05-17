# Ticket-mention preview popover — design

**Ticket:** T-57 — *When clicking a mention of a ticket show popover instead of linking*
**Branch:** `chore/T-57-ticket-mention-popover`
**Date:** 2026-05-14

## Problem

Today, a `[T-12](mention:ticket/T-12)` chip in a comment or description renders as a `Badge` wrapped in a TanStack Router `Link` to `/orgs/$orgSlug/projects/$slug/tickets/$id`. Clicking the chip yanks the reader out of their current flow — into a different page — when most of the time they only want a glance at status, owner, and gist before deciding whether to actually open the ticket.

We want a preview-on-hover experience for ticket mentions, with click-to-pin and an explicit "view ticket" link as the navigation affordance.

## Scope

**In scope**

- Replace the bare `Link` wrapper on ticket-variant `MentionChip` with a base-ui `Popover` that previews the ticket.
- Render the popover only in `Markdown.tsx`'s output (comments, descriptions, anywhere we render user markdown read-only).
- Card content: title, status/type/priority cluster, assignees, first body line, branch/PR pill (when attached), and a "view ticket" link.
- Hover-and-leave behavior, click-pin behavior, modifier-click pass-through (Cmd/Ctrl/middle-click opens new tab), keyboard support.
- Light/dark theming via existing tokens.
- Component-level tests and a manual checklist.

**Out of scope**

- The `MentionChip` used inside the Lexical editor (where the user is *typing*) stays inert — same plain badge as today, no popover. Reason: mid-composition hover-previews fight the cursor and feel noisy.
- User mentions (`mention:user/...`) — they stay as the existing Link-wrapped badge.
- Refactoring `Lexical/MentionChip.tsx`'s location despite it now being used outside Lexical. Separate cleanup.
- Tag chips on the card. Skipped per design discussion; the meta cluster is enough.
- Any new dependency. We deliberately avoid adding shadcn HoverCard alongside our existing base-ui Popover.

## Architecture

```
packages/frontend/src/components/Lexical/
├── MentionChip.tsx          ← modify ticket branch
└── TicketMentionCard.tsx    ← new
```

### `MentionChip.tsx` (ticket branch, modified)

```
<Popover>
  <Popover.Trigger
    render={<Link to=".../tickets/$id" params={...} />}
    openOnHover
  >
    <Badge tone="muted" size="xs" className="font-mono align-middle">
      {id}
    </Badge>
  </Popover.Trigger>
  <Popover.Content className="w-80">
    <TicketMentionCard ticketId={id} />
  </Popover.Content>
</Popover>
```

- The trigger is the same anchor we render today, so Cmd/Ctrl/middle-click and "Open in new tab" work natively.
- `openOnHover` gives the hover behavior; a plain click on the same trigger pins it open until outside-press or Escape (base-ui Popover handles this automatically).
- If `useMentionScope()` returns `null` (no project context), we degrade to today's plain Badge with no link and no popover. Matches existing graceful-fallback behavior.

### `TicketMentionCard.tsx` (new)

```
function TicketMentionCard({ ticketId }: { ticketId: TicketId }) {
  const scope = useMentionScope()
  if (!scope) return null            // defensive — shouldn't happen if trigger rendered
  const result = useAtomValue(
    ticketAtom(ticketKey(scope.orgSlug, scope.slug, ticketId))
  )
  // render success / waiting / failure
}
```

Subscribed atom is `ticketAtom`, already defined in `packages/frontend/src/atoms/tickets.ts`. Its merge logic gives us list-cached metadata instantly (when the project's `ticketsListAtom` is loaded — which is the common case) and streams in the `body` from `ticketBaseAtom` on demand. Idle TTL: 2 minutes on `ticketBaseAtom`, so quick open/close cycles don't refetch.

## Card layout

Width 320px (`w-80`), padding inherited from `PopoverContent`'s `p-3 rounded-lg border bg-popover shadow-md`. No new tokens.

```
T-57                                           ← Geist Mono, muted-foreground, xs
when clicking a mention of a ticket            ← Geist Sans, medium weight,
show popover instead of linking                  2-line clamp, text-foreground

· in progress  · chore  · med                  ← muted row: status pill, type
                                                  icon, priority — same renderers
                                                  as the list

right now when you leave a comment             ← first body line, italic,
referring to another ticket…                     muted-foreground, 1-line truncate

[●][●]                                         ← MemberAvatar size=16, stacked,
                                                  only if assignees.length > 0
🔗 chore/T-57-…  ·  #42 open                   ← only if ticket.branch
────────────────────────────────
                          view ticket →        ← right-aligned text link
```

Rules:

- Sentence case throughout. No uppercase headers, no `STATUS:` labels.
- Status/type/priority chips use the same components the ticket list uses — no fresh visual language.
- Branch text in Geist Mono. The arrow on "view ticket →" is text, not an icon.
- No drop shadows beyond the popover's own; no decorative borders inside the card.

### First body line extraction

The body is CommonMark. We strip a leading `# Heading\n` (the auto-prefixed title) and take the first non-empty line, plain text (no formatting carried). Implementation: a small `firstBodyLine(markdown: string)` helper colocated in `TicketMentionCard.tsx`. Empty body → no body row.

## States

| State | What renders |
|---|---|
| **Success, list-cached + body loaded** | All fields. The common case. |
| **Success, list-cached, body pending** | Metadata renders; body row is a single muted skeleton bar (~16ch). Fills in when `ticketBaseAtom` resolves. |
| **Cold (not in list cache)** | Skeleton: id stays visible; three short bars for title, meta, body. Streams in as atoms resolve. |
| **`NotFound` / `Forbidden`** | Single muted line: "ticket not available". No retry. |
| **Network failure** | Same copy as NotFound. We don't distinguish. |

No `animate-pulse` "waiting" treatment on the card data — it's a read snapshot, not a mutation surface.

## Click and keyboard semantics

| Input | Result |
|---|---|
| Hover | Popover opens after base-ui's default delay; leaving the trigger + content area closes it (default 150-ish ms close delay handled by base-ui). |
| Click (no modifier) | Popover pins open. Stays open until outside-press or Escape. Anchor navigation is suppressed by the trigger. |
| Cmd/Ctrl-click | Browser opens ticket page in a new tab. Popover does *not* open. |
| Middle-click (`button === 1`) | Same as Cmd-click. |
| Right-click | Native browser context menu. |
| `Tab` → focus chip → `Enter` | Pins popover open. |
| `Escape` while open | Closes. |
| Touch (no hover) | Tap pins; tap outside or "view ticket" closes/navigates. |

**Modifier pass-through:** if base-ui's `Popover.Trigger` blocks modifier clicks from reaching the rendered anchor, we add an `onClickCapture` on the rendered `Link` that does `if (e.metaKey || e.ctrlKey || e.button === 1) return  // let browser handle it`. Verify during implementation; only add if needed.

## i18n

Two new keys in `packages/frontend/messages/en/tickets.json` (sorted under `tickets_` prefix):

- `tickets_mention_card_view_ticket` → `"view ticket"`
- `tickets_mention_card_not_available` → `"ticket not available"`

No "loading" string — skeletons carry it.

## Theming

Both themes are reviewed:

- Card surface: `bg-popover` / `text-popover-foreground` (already themed).
- Title: `text-foreground`.
- Meta row, ID line, body line, "ticket not available": `text-muted-foreground`.
- Status/type/priority: reuse the same renderers as the list, which are already dual-theme.
- Branch chip: existing component.
- Hover-affected elements (e.g. "view ticket" link): `transition-colors hover:text-foreground` so the asymmetric hover rule applies (per `CLAUDE.md`).

## Testing

**Component tests**

- `MentionChip` ticket variant inside a `MentionScopeProvider` renders a `Popover` trigger.
- `MentionChip` ticket variant *without* a scope renders the plain Badge (no popover, no link). Existing fallback behavior preserved.
- `TicketMentionCard` with a stubbed `ticketAtom`:
  - success path renders title, meta, body line.
  - success-without-body renders skeleton on the body row.
  - failure renders the "ticket not available" line.

**Manual checklist on the dev server**

- Hover a mention in a comment → preview opens; leave → closes.
- Click → pins; outside-press / Escape → closes.
- Cmd/Ctrl-click → new tab, no popover.
- Middle-click → new tab, no popover.
- Right-click → context menu.
- Tab to chip + Enter → pins.
- Touch interaction on a tablet form factor.
- Mention to a real ticket: full card.
- Mention to a deleted / unknown ticket id: "ticket not available".
- Both light and dark themes look finished.
- Press-feel rule on "view ticket" link: it's a text link, not a button, so the `active:scale-[0.97]` rule does not apply (press feel rule is button-only per CLAUDE.md).

## Files touched

| File | Change |
|---|---|
| `packages/frontend/src/components/Lexical/MentionChip.tsx` | Wrap ticket branch in `Popover` + `TicketMentionCard`. |
| `packages/frontend/src/components/Lexical/TicketMentionCard.tsx` | New. |
| `packages/frontend/messages/en/tickets.json` | Two new keys (in alpha order under `tickets_` prefix). |
| `packages/frontend/src/paraglide/messages/*` | Regenerated by paraglide build. |
| `packages/frontend/src/components/Lexical/MentionChip.test.tsx` *(if a test file exists; else colocated test)* | Add tests for ticket variant with/without scope. |
| `packages/frontend/src/components/Lexical/TicketMentionCard.test.tsx` | New. |

## Risks and unknowns

- **Modifier-click behavior in base-ui Popover.Trigger** is the one thing to verify during implementation. If it blocks Cmd-click navigation, the `onClickCapture` workaround above is the fix.
- **Hover delay tuning.** base-ui's defaults are fine to start; if previews feel too eager we adjust via the trigger's `delay` prop (single number) in a follow-up.
- **Popover footprint on long pages with many mentions.** Each chip mounts a `Popover` root, but content is portaled and only renders when open. One ref + a few listeners per chip is acceptable; we'll watch a heavy thread (say 50+ mentions) during manual testing.
