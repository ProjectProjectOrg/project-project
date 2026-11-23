import type { ChangelogEntry } from "@pp/shared"
import { ChevronRight } from "@pp/ui/icons"
import { ListHoverScope } from "@pp/ui/list-row"
import { Link } from "@tanstack/react-router"

import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

import { displayVersion } from "../lib/displayVersion"
import { releaseCounts, releaseDate, SECTION_IDS } from "../lib/releaseView"
import { AnchorHeading } from "./AnchorHeading"

// Every release before the latest, one row each; a row opens that release
// on its own page.
export function EarlierReleases({
  entries
}: Readonly<{ entries: ReadonlyArray<ChangelogEntry> }>) {
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
      <ListHoverScope className="-mx-3">
        <ul className="flex flex-col gap-1">
          {entries.map((entry) => (
            <li key={entry.version}>
              <EarlierRelease entry={entry} />
            </li>
          ))}
        </ul>
      </ListHoverScope>
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

function EarlierRelease({ entry }: Readonly<{ entry: ChangelogEntry }>) {
  const date = releaseDate(entry.date, "long", getLocale())
  return (
    <Link
      to="/changelog/$version"
      params={{ version: entry.version }}
      data-slot="list-row"
      className="focus-ring relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 rounded-xl px-3 py-4 transition-transform duration-100 [corner-shape:var(--button-corner)] active:scale-[0.99]"
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
      <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
    </Link>
  )
}
