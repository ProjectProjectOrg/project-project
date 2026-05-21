# Merge actions panel redesign

## Problem

The current `ReviewActions` panel (`packages/frontend/src/components/Reviews/ReviewActions.tsx`) reads as a GitHub clone: three identical-height status slabs (review / checks / mergeability) stacked above a flat action row. The merge button — the climax of the whole PR flow — sits as just-another-button. "Merging can be performed automatically" repeats above and below. No visual reward for reaching the ready state.

## Direction

Compress status into a Linear-style strip and let the merge action be the climax. Reuse two existing brand-threads instead of inventing chrome:

- **Diff-pip vocabulary** (`packages/frontend/src/components/Reviews/ReviewOverview.tsx` already uses tiny `size-2 rounded-sm` squares for additions/deletions) becomes the status indicator language. Replaces the big colored circles.
- **Dither texture** (already wired on `<Button variant="dither">`, used by the Sprint CTA) appears on the merge button only when the PR is mergeable. Reaching the ready state is rewarded visually.

## Layout

One bordered panel, two zones, no inner card chrome:

```
┌──────────────────────────────────────────────────────┐
│  ▪ review · pending  │  ▪ checks · 1/1  │  ▪ branch · clean merge  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ▓▓▓░░░ squash & merge ▓▓▓░░░ ⌄   submit review →  ⋯ │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Status strip (top)**

- Three cells separated by thin vertical `border-r border-border/60` dividers. Horizontal scroll on overflow (mobile).
- Cell = `2.5×2.5` square pip (`bg-state-success` / `bg-state-danger` / `bg-state-warning` / `bg-muted-foreground/50`) + sentence-case label in muted grey + value in foreground.
- Cell labels live in `messages/en/reviews.json` as `reviews_strip_*` keys.

**Action zone (bottom)**

- Merge button: `<Button variant="dither" size="md" ditherFrom="var(--foreground)" ditherTo="var(--background)" ditherDirection="r">` when `canUseMerge && mergeable`. Plain `variant="primary"` otherwise.
- Method dropdown chevron stays glued to the merge button's right edge (existing split-button shape).
- Right side: `submit review` (tertiary) + `…` menu (close action).
- Removed: the right-aligned hint paragraph ("Merging can be performed automatically.") — the strip already covers it.

**Terminal states**

- `merged` → single full-width row: `▪ merged · <relative time>`. No actions.
- `closed` (not merged) → single row with reopen button inline: `▪ closed   [↺ reopen]`.

**Removed**

- The inline `ReviewerDecisionRow` list inside the merge panel. The sidebar's `PeopleSection` already shows reviewer decisions in detail, so duplicating it adds noise.

## Out of scope

- Sidebar (`ReviewOverview`'s right column) — untouched.
- `StatsStrip` at the top of the review page — untouched.
- New translations files or domains — adds keys under existing `reviews_` prefix only.
