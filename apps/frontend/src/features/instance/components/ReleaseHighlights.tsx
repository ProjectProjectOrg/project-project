import type { ChangelogHighlight, ChangelogNotice } from "@pp/shared"
import { Markdown } from "@pp/ui/editor/markdown"
import { AlertTriangle } from "@pp/ui/icons"

import { m } from "@/paraglide/messages"

import { AREA_ICONS, areaLabel } from "../lib/changelogAreas"
import { highlightId, SECTION_IDS } from "../lib/releaseView"
import { AnchorHeading } from "./AnchorHeading"
import { ChangelogVideo } from "./ChangelogVideo"

export function Highlights({
  highlights
}: Readonly<{ highlights: ReadonlyArray<ChangelogHighlight> }>) {
  return (
    <section
      id={SECTION_IDS.highlights}
      aria-labelledby={`${SECTION_IDS.highlights}-title`}
      className="flex scroll-mt-6 flex-col gap-24"
    >
      <h2 id={`${SECTION_IDS.highlights}-title`} className="sr-only">
        {m.profile_changelog_highlights()}
      </h2>
      {highlights.map((highlight, index) => (
        <Highlight
          key={highlight.text}
          highlight={highlight}
          rank={index + 1}
          total={highlights.length}
        />
      ))}
    </section>
  )
}

function Highlight({
  highlight,
  rank,
  total
}: Readonly<{ highlight: ChangelogHighlight; rank: number; total: number }>) {
  const id = highlightId(rank)
  const Icon = highlight.area === null ? null : AREA_ICONS[highlight.area]
  return (
    <article id={id} className="flex scroll-mt-6 flex-col">
      <p className="flex items-baseline gap-2 text-caption font-semibold text-muted-foreground tabular-nums">
        <span>
          {total === 1
            ? m.profile_changelog_highlight_single()
            : m.profile_changelog_highlight_eyebrow({ rank, total })}
        </span>
        {highlight.area === null ? null : (
          <>
            <span aria-hidden>·</span>
            <span className="flex items-baseline gap-1.5">
              {Icon === null ? null : (
                <Icon aria-hidden className="size-3.5 self-center" />
              )}
              {areaLabel(highlight.area)}
            </span>
          </>
        )}
      </p>
      <AnchorHeading
        anchor={id}
        level="highlight"
        label={highlight.text}
        className="mt-3"
      >
        {highlight.text}
      </AnchorHeading>
      {highlight.video === null ? null : (
        <ChangelogVideo
          video={highlight.video}
          label={highlight.text}
          className="mt-7 rounded-xl [corner-shape:var(--button-corner)]"
        />
      )}
      {highlight.body === "" ? null : (
        <Markdown blocks="flat" size="reading" className="mt-7 max-w-[62ch]">
          {highlight.body}
        </Markdown>
      )}
      {highlight.where === null ? null : (
        <p className="mt-4 flex max-w-[62ch] gap-3 text-body text-pretty text-muted-foreground">
          <span className="shrink-0 font-semibold text-foreground">
            {m.profile_changelog_where()}
          </span>
          <span>{highlight.where}</span>
        </p>
      )}
    </article>
  )
}

export function Notices({
  notices
}: Readonly<{ notices: ReadonlyArray<ChangelogNotice> }>) {
  return (
    <section
      id={SECTION_IDS.notices}
      className="flex scroll-mt-6 flex-col gap-8"
    >
      <AnchorHeading
        anchor={SECTION_IDS.notices}
        level="section"
        label={m.profile_changelog_notices()}
      >
        <AlertTriangle aria-hidden className="size-6 self-center" />
        {m.profile_changelog_notices()}
      </AnchorHeading>
      <div className="flex flex-col gap-8">
        {notices.map((notice) => (
          <div
            key={notice.text}
            className="flex flex-col gap-2 border-l-2 border-foreground pl-5"
          >
            <h3 className="text-title font-semibold text-balance">
              {notice.text}
            </h3>
            {notice.body === "" ? null : (
              <Markdown blocks="flat" size="reading" className="max-w-[62ch]">
                {notice.body}
              </Markdown>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
