# Aesthetic project data moves to Postgres

Changes where a project's banner and icon image live, and adds an inline
placeholder so banners paint instantly. This amends a core project principle,
so the rule change comes first.

## The rule

Today the implicit rule is "markdown is the source of truth". That is right for
content, and wrong for presentation artefacts we have since added.

The rule becomes:

> Markdown holds what is **portable and cheap**: anything a human would write or
> read, anything another tool could use, expressed in a few characters.
> Postgres holds what is neither — data that is large, opaque, or meaningless
> outside this instance.

Losing the Postgres half costs a re-upload, not information.

`AGENTS.md` gains this rule in the project-context section, next to the existing
markdown-first statement, so the two are read together.

## What moves

| Stays in markdown | Moves to Postgres only |
| --- | --- |
| `icon` — the emoji, one character, readable and portable | `banner` |
| `color` — the accent colour, seven characters, lets another tool group projects | `iconImage` |
| | `placeholder` (new) |

`banner` and `iconImage` fail the portability test on their own terms, not just
the aesthetic one: both are an `attachmentId` plus a crop, and the id refers to
an object in this org's bucket. Copied into another workspace the frontmatter is
already meaningless. A hex colour survives that copy; an attachment id cannot.

The emoji and the colour stay because they are short, human-readable, and useful
to anything that reads the folder.

## What this fixes

The two stores are already read inconsistently. `Projects.ts` reads
`projectIndex.banner` in `list()` (lines 425, 457) but `file.banner` in `get()`
and its neighbours (lines 826, 999, 1063). A hand-edited `project.md`, or a
write that half-fails, makes the projects list and the project page disagree.

Making Postgres authoritative for these fields removes that divergence rather
than introducing one.

## Migration

The data is already in Postgres. `create()` and `updateProject()` both write
`project_index.banner` and `icon_image` alongside the frontmatter, so no data
migration is required — this is a read-path change plus a stop-writing change.

- Reads switch from `file.banner` / `file.iconImage` to the index row.
- Writes stop emitting `banner` and `iconImage` into frontmatter.
- Existing keys in existing `project.md` files are ignored on read and dropped
  on the next write. No cleanup script; the files converge as projects are
  edited, and a stale key is inert.

## The placeholder

A base64 WebP of the banner, small enough to inline in the project JSON, so it
arrives with the data and paints on first render with no network round trip.
This removes the last visible jump: the blur-up currently cannot start until the
image itself has loaded.

- **Format:** `data:image/webp;base64,…`, longest edge **24px**, quality ~0.5.
- **Budget:** under **1.5KB** encoded. If a given image exceeds it, drop quality
  before dropping dimensions — the placeholder is blurred to nothing anyway.
- **Field:** `placeholder: string | null` on `ProjectBanner`.
- **Rendered:** as the blur-up's starting image, replacing the network-loaded
  placeholder for the first paint. The existing crop and fade-mask treatment
  applies to it unchanged.

Storing base64 is only acceptable because it lives in a `jsonb` column. It was
rejected while this data lived in frontmatter, where 800 characters on one line
would have wrecked a hand-editable file. Now that the markdown objection is
gone, base64 beats ThumbHash: better fidelity, and no new dependency.

**Banner only.** Icons do not get a placeholder. They render at most 48px, so
they arrive almost immediately, and they already have the emoji as an instant
fallback — they are never blank. Adding one would be cost without a symptom.

## Generation

**On upload**, in the browser. `compressImage` already decodes to a canvas, so
the placeholder is drawn from the same bitmap and sent in the update payload.
New banners cost the server nothing.

**Backfill**, lazily on read. When a project is read and its banner is an
attachment with a null placeholder, generate one server-side with `sharp` from
the stored original, persist it, and return it. Roughly 20-40ms once per
project, then never again. No migration script: anything uploaded before this
change self-heals the first time someone looks at it.

If generation fails, persist nothing and return null — the banner then behaves
exactly as it does today. A missing placeholder must never fail a project read.

## Risks

- **Postgres becomes authoritative for two fields.** A restore from the markdown
  tree alone returns projects with their emoji and accent colour but no banner
  or icon image. That is the accepted trade: aesthetics cost a re-upload.
- **Backfill runs inside a read.** It is bounded (once per project, ~40ms) but it
  is work on a read path. If that proves noticeable, move it to a background
  job; the lazy approach is chosen for simplicity, not because it is the only
  option.
- **The placeholder inflates every project payload** by up to 1.5KB. For a list
  of many projects this is the one place the budget matters, which is why it is
  banner-only and capped.

## Out of scope

- Placeholders for icons or ticket attachments.
- Any change to the emoji or accent colour storage.
- Removing the now-unused frontmatter keys from existing files by script.
