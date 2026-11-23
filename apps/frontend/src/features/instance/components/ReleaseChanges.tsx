import type { ChangelogItem } from "@pp/shared"
import { cn } from "@pp/ui/lib/utils"

import { m } from "@/paraglide/messages"

import { AREA_ICONS, areaLabel, OTHER_AREA_ICON } from "../lib/changelogAreas"
import { type AreaRun, groupByArea } from "../lib/releaseView"

export type Density = "full" | "compact"

export function AreaRuns({
  items,
  repository,
  density
}: Readonly<{
  items: ReadonlyArray<ChangelogItem>
  repository: string | null
  density: Density
}>) {
  const runs = groupByArea(items)
  const [only] = runs
  if (runs.length === 1 && only?.area === null)
    return (
      <Lines items={only.items} repository={repository} density={density} />
    )
  return (
    <div
      className={cn(
        "@container flex flex-col",
        density === "full" ? "gap-7" : "gap-4"
      )}
    >
      {runs.map((run) => (
        <Run
          key={run.area ?? "other"}
          run={run}
          repository={repository}
          density={density}
        />
      ))}
    </div>
  )
}

function Run({
  run,
  repository,
  density
}: Readonly<{ run: AreaRun; repository: string | null; density: Density }>) {
  const Icon = run.area === null ? OTHER_AREA_ICON : AREA_ICONS[run.area]
  return (
    <div
      className={cn(
        "grid items-start gap-y-2",
        density === "full"
          ? "@[32rem]:grid-cols-[6.5rem_minmax(0,1fr)] @[32rem]:gap-x-4"
          : "@[32rem]:grid-cols-[6rem_minmax(0,1fr)] @[32rem]:gap-x-3"
      )}
    >
      {/* As tall as a change's first line, so the label and its icon sit
          centred on it. */}
      <p
        className={cn(
          "flex items-center gap-2 text-caption font-semibold text-muted-foreground",
          density === "full" ? "h-6" : "h-5"
        )}
      >
        <Icon aria-hidden className="size-3.5 shrink-0" />
        <span>
          {run.area === null
            ? m.profile_changelog_area_other()
            : areaLabel(run.area)}
        </span>
      </p>
      <Lines items={run.items} repository={repository} density={density} />
    </div>
  )
}

function Lines({
  items,
  repository,
  density
}: Readonly<{
  items: ReadonlyArray<ChangelogItem>
  repository: string | null
  density: Density
}>) {
  return (
    <ul
      className={cn(
        "flex flex-col text-pretty",
        density === "full"
          ? "gap-2.5 text-title-compact leading-6"
          : "gap-1.5 text-body"
      )}
    >
      {items.map((item) => (
        <li key={item.text}>
          {item.text}
          <PullRequests prs={item.prs} repository={repository} />
        </li>
      ))}
    </ul>
  )
}

export function PullRequests({
  prs,
  repository
}: Readonly<{ prs: ReadonlyArray<number>; repository: string | null }>) {
  if (prs.length === 0) return null
  return (
    <span className="ml-2 inline-flex gap-1.5 align-baseline text-caption text-muted-foreground tabular-nums">
      {prs.map((pr) =>
        repository === null ? (
          <span key={pr}>#{pr}</span>
        ) : (
          <a
            key={pr}
            href={`${repository}/pull/${pr}`}
            target="_blank"
            rel="noreferrer"
            aria-label={m.profile_changelog_pr({ number: pr })}
            className="focus-ring rounded-sm underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            #{pr}
          </a>
        )
      )}
    </span>
  )
}
