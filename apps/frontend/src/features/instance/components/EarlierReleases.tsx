import type { ChangelogEntry, ChangelogItem } from "@pp/shared"
import { AutoHeight } from "@pp/ui/auto-height"
import { ChevronRight } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"

import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

import { sectionTitle } from "../lib/changelogAreas"
import { displayVersion } from "../lib/displayVersion"
import {
  releaseCounts,
  releaseDate,
  releaseId,
  repositoryUrl,
  SECTION_IDS,
  SECTION_KINDS,
  sectionItems
} from "../lib/releaseView"
import { AnchorHeading } from "./AnchorHeading"
import { AreaRuns, PullRequests } from "./ReleaseChanges"

export function EarlierReleases({
  entries,
  isOpen,
  onToggle
}: Readonly<{
  entries: ReadonlyArray<ChangelogEntry>
  isOpen: (version: string) => boolean
  onToggle: (version: string) => void
}>) {
  return (
    <section
      id={SECTION_IDS.earlier}
      className="flex scroll-mt-6 flex-col gap-6"
    >
      <AnchorHeading
        anchor={SECTION_IDS.earlier}
        level="section"
        label={m.profile_changelog_earlier()}
      >
        {m.profile_changelog_earlier()}
      </AnchorHeading>
      <ul className="flex flex-col border-y border-border">
        {entries.map((entry) => (
          <EarlierRelease
            key={entry.version}
            entry={entry}
            open={isOpen(entry.version)}
            onToggle={() => onToggle(entry.version)}
          />
        ))}
      </ul>
    </section>
  )
}

const summary = (entry: ChangelogEntry) => {
  const counts = releaseCounts(entry)
  return [
    counts.highlights === 0
      ? null
      : m.profile_changelog_count_highlights({ count: counts.highlights }),
    m.profile_changelog_changes({ count: counts.changes })
  ]
    .filter((part) => part !== null)
    .join(" · ")
}

function EarlierRelease({
  entry,
  open,
  onToggle
}: Readonly<{ entry: ChangelogEntry; open: boolean; onToggle: () => void }>) {
  const id = releaseId(entry.version)
  const panelId = `${id}-notes`
  const date = releaseDate(entry.date, "long", getLocale())
  return (
    <li id={id} className="scroll-mt-6 border-border not-first:border-t">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="focus-ring -mx-3 grid w-[calc(100%+1.5rem)] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 rounded-sm px-3 py-4 text-left transition-[background-color,scale] duration-100 [corner-shape:var(--button-corner)] hover:bg-hover active:scale-[0.99]"
        >
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-0.5">
            <span className="text-title font-semibold tabular-nums">
              {displayVersion(entry.version)}
            </span>
            {date === null ? null : (
              <time
                dateTime={entry.date}
                className="text-body text-muted-foreground"
              >
                {date}
              </time>
            )}
            {entry.channel === "nightly" ? (
              <span className="text-body text-muted-foreground">
                {m.profile_changelog_nightly()}
              </span>
            ) : null}
            <span className="text-body text-muted-foreground tabular-nums sm:ml-auto">
              {summary(entry)}
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
      </h3>
      <AutoHeight>
        <div id={panelId} hidden={!open}>
          <EarlierNotes entry={entry} />
        </div>
      </AutoHeight>
    </li>
  )
}

type NotesGroup = Readonly<{
  key: string
  title: string
  items: ReadonlyArray<ChangelogItem>
  plain: boolean
}>

function EarlierNotes({ entry }: Readonly<{ entry: ChangelogEntry }>) {
  const repository = repositoryUrl(entry.url)
  const groups: ReadonlyArray<NotesGroup> = [
    {
      key: "highlights",
      title: m.profile_changelog_highlights(),
      items: entry.highlights.map(({ text, area, prs }) => ({
        text,
        area,
        prs
      })),
      plain: true
    },
    {
      key: "notices",
      title: m.profile_changelog_notices(),
      items: entry.notices.map(({ text, prs }) => ({ text, area: null, prs })),
      plain: true
    },
    ...SECTION_KINDS.map((kind) => ({
      key: kind,
      title: sectionTitle(kind),
      items: sectionItems(entry, kind),
      plain: false
    }))
  ].filter((group) => group.items.length > 0)
  return (
    <div className="flex flex-col gap-8 pt-2 pb-10">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-3">
          <h4 className="flex items-baseline gap-2 text-subtitle font-semibold">
            {group.title}
            <span className="text-caption font-normal text-muted-foreground tabular-nums">
              {group.items.length}
            </span>
          </h4>
          {group.plain ? (
            <ul className="flex flex-col gap-1.5 text-body text-pretty">
              {group.items.map((item) => (
                <li key={item.text}>
                  {item.text}
                  <PullRequests prs={item.prs} repository={repository} />
                </li>
              ))}
            </ul>
          ) : (
            <AreaRuns
              items={group.items}
              repository={repository}
              density="compact"
            />
          )}
        </div>
      ))}
    </div>
  )
}
