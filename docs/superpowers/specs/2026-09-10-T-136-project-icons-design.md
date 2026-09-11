# T-136: Custom project icons

Supersedes the icon half of `2026-09-09-T-136-project-images-design.md`, which
recorded agreed product behaviour but left the architecture open. The banner
half of that document shipped as T-158 and is now on `main`.

## What we are building

A project icon can be an image instead of an emoji. The emoji stays as a real
runtime fallback. Uploaded images are processed in the browser: a deterministic
background removal produces a sticker when the background is simple, and a
cropped full-bleed image when it is not.

## What T-158 already provides

Icons ride on infrastructure the banner work landed. None of it is
banner-specific:

- `project_image_reference(project_slug, org_slug, attachment_id, slot)`, keyed
  `(project_slug, slot)`. `slot` is a free-text discriminator.
- `attachment_index.ticket_id` is nullable, so attachments can be project-owned.
- `POST /orgs/:orgSlug/projects/:slug/attachments/prepare` and
  `.../:attachmentId/commit` (`prepareProject` / `commitProject`), which pass a
  null ticket.
- `replaceProjectImageReference` validates the attachment is a committed raster
  image, upserts the slot, marks it `live`, and orphans the previous occupant
  only when no ticket reference and no other slot still points at it.
- The `ProjectDocs` pattern of storing structured data in project frontmatter
  and mirroring it to a `jsonb` column.

Icons add two slot values, `icon` and `icon_source`. No migration is required
for the reference table itself.

## Data model

`icon` keeps its current meaning and stays required — a 1–16 character emoji
string. `iconImage` is added beside it, nullable.

```ts
export const ProjectIconCrop = ProjectBannerCrop // { x, y, zoom }

export const ProjectIconImage = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("sticker"),
    sourceAttachmentId: AttachmentId,
    renderedAttachmentId: AttachmentId,
    cutoutTolerance: Schema.NullOr(
      Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 160 })))
    ),
    crop: ProjectIconCrop
  }),
  Schema.Struct({
    type: Schema.Literal("full_bleed"),
    sourceAttachmentId: AttachmentId,
    crop: ProjectIconCrop
  })
])
```

Decisions encoded in that shape:

- **Both attachments are stored for stickers.** The original stays editable and
  the rendered cutout is cheap to display. Re-running a flood fill on every
  sidebar paint is the cost being avoided.
- **`full_bleed` has no rendered attachment.** A crop is cheap to reapply at
  render time, exactly as the banner does, so there is nothing to bake.
- **`cutoutTolerance: null` is the transparent-PNG passthrough.** The source
  arrived with its own alpha and no flood fill ran.
- **Feather is a constant of 1**, not persisted. Other values were not worth
  exposing.
- **Nothing about the sticker outline is stored.** It is render-time CSS so it
  can respond to theme.

Setting an icon writes both slots in one transaction, so a half-written icon
cannot survive a failure.

## Processing

Browser-side, no model, no new dependency. Evidence is in
`tools/icon-cutout/` and the probe route; the spike is commit `32a676c4`.

**Branch first on existing alpha.** If the source already has meaningful
transparency, skip the cutout entirely and offer the sticker directly. This is
the most common real upload — a logo PNG — and running a flood fill on it
produces a wrong result with a misleading explanation.

**Otherwise run the corner check**, and on failure fall back to full-bleed with
an honest reason. The check samples four 16px corner patches:

| Check | Limit |
| --- | --- |
| Corner spread (max pairwise distance between corner means) | ≤ 24 |
| Corner noise (max within-patch stddev) | ≤ 14 |
| Removed fraction | ≥ 0.08 and ≤ 0.94 |
| Mean colour distance across the mask boundary | ≥ 26 |

The border-retention check from the spike is dropped: a subject clipped by the
image edge produces a correct cutout, and framing is the crop UI's job.

**The fill compares every candidate against the global background colour**, not
against its neighbour. Region growing handles gradient backgrounds better but
walks straight through a subject that fades toward the background, destroying it
while still reporting success. Gradient backgrounds are rejected instead, which
is the conservative and honest trade.

**Tolerance is a user control**, defaulting to 24. This is not a tuning
convenience — no metric moves when the fill eats into the subject, so the check
cannot detect over-removal. A soft drop shadow needs ~90 to shed its halo; a
subject fading toward the background needs ~24. The preview is therefore the
safety mechanism, not decoration, and the user must be able to see the result
before accepting it.

### Performance

`analyzeCutout` costs 23.7ms at 512px against a 16.7ms frame budget, so live
dragging stutters. Measured on `photo-busy.png`:

| | ms |
| --- | --- |
| @512 (current) | 23.7 |
| @512, feather off | 12.3 |
| @256 | 2.8 |
| @192 | 1.7 |

- Analyse the live preview at **256px**; run full resolution once on apply.
  Tolerance is a colour distance, so the verdict is resolution-independent
  except at the margins.
- **rAF-throttle** the tolerance slider rather than debouncing it, so the
  preview tracks the thumb instead of lagging it.
- **Animate the fill on first drop only.** The BFS queue makes progressive
  rendering nearly free, and it explains what is being removed while the
  full-resolution pass runs. During drag it is wrong — stretching a 2.8ms
  computation over an animation would feel worse than snapping.

### Rendering

The sticker outline must be **contrast-aware**. A fixed white outline
disappears on light surfaces, and a monochrome logo is the worst case. Derive
it from theme at render time; the stored PNG stays a plain alpha cutout.

## Surfaces

- **Entry point:** the existing emoji picker in project settings gains an upload
  affordance. No second entry point on the project header — the banner
  established settings as where image editing happens.
- **Permissions:** reuse the project write check guarding `updateProject`;
  `owner`, `admin` and `member` may all set an icon, matching who can already
  set the emoji. Verify `prepareProject` / `commitProject` enforce the same
  check, since they are separate endpoints.
- **Disconnected storage:** render the upload affordance disabled with the
  existing `StorageNotConnected` messaging, as `ProjectBannerSettings` already
  does via `storageAvailable`. The emoji still renders, so the icon never
  breaks.
- **Storage disconnected after upload:** `iconImage` points at attachments that
  no longer resolve. Fall back to `icon` on image load failure — no extra state
  needed, and it is what the emoji fallback exists for.

## Rejected: a local model

`@imgly/background-removal` was installed, measured against the same fixtures,
and removed.

- ~95–110MB of weights on first use (`isnet_fp16` is 84.1MB plus 11.3MB of
  onnxruntime wasm), fetched from a third-party CDN.
- 18.3s cold on an unthrottled local machine.
- Full speed needs `crossOriginIsolated`, i.e. COOP/COEP headers across the
  whole app, which would change how every cross-origin resource loads —
  including S3 attachments.
- On the real app icon it produced a technically clean cutout that stripped the
  brand's deliberate dark container. Background removal assumes there is a
  background worth removing; for logo-shaped inputs that is a category error,
  not a confidence problem.

It would have fixed exactly one of the spike's findings — that no single
tolerance works. The sticker outline and the transparent-PNG branch are
inherent to the feature and needed regardless.

Notably, flood fill reproduces the model's result on that same app icon at
tolerance ≥ 90, for free: above that threshold the fill crosses from the
transparent corners into the squircle and lifts out the glyph. Which of the two
results is wanted is the user's call, which is the argument for the slider.

## Out of scope

- Organisation avatars, though the slot model would extend to them.
- Animated or SVG icons.
- Reusing an existing attachment as an icon; upload only.
