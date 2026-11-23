import type { ChangelogHighlight, ChangelogNotice } from "@pp/shared"
import { AutoHeight } from "@pp/ui/auto-height"
import { Markdown } from "@pp/ui/editor/markdown"
import { AlertTriangle, ChevronRight } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"

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

// Notes for whoever hosts the instance, not for the people using it: closed
// at the end of the release until someone opens them.
export function Notices({
  notices,
  open,
  onToggle
}: Readonly<{
  notices: ReadonlyArray<ChangelogNotice>
  open: boolean
  onToggle: () => void
}>) {
  const panelId = `${SECTION_IDS.notices}-notes`
  return (
    <section id={SECTION_IDS.notices} className="scroll-mt-6">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="focus-ring -mx-3 grid w-[calc(100%+1.5rem)] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl px-3 py-4 text-left transition-[background-color,scale] duration-100 [corner-shape:var(--button-corner)] hover:bg-hover active:scale-[0.99]"
        >
          <AlertTriangle aria-hidden className="size-5 text-muted-foreground" />
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="text-title font-semibold">
              {m.profile_changelog_notices()}
            </span>
            <span className="text-body text-muted-foreground">
              {m.profile_changelog_notices_audience({ count: notices.length })}
            </span>
          </span>
          <ChevronRight
            aria-hidden
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-90"
            )}
          />
        </button>
      </h2>
      <AutoHeight>
        <div id={panelId} hidden={!open}>
          <div className="flex flex-col gap-8 pt-4 pb-2">
            {notices.map((notice) => (
              <div
                key={notice.text}
                className="flex flex-col gap-2 border-l-2 border-foreground pl-5"
              >
                <h3 className="text-title font-semibold text-balance">
                  {notice.text}
                </h3>
                {notice.body === "" ? null : (
                  <Markdown
                    blocks="flat"
                    size="reading"
                    className="max-w-[62ch]"
                  >
                    {notice.body}
                  </Markdown>
                )}
              </div>
            ))}
          </div>
        </div>
      </AutoHeight>
    </section>
  )
}
