import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { ChangelogEntry } from "@pp/shared"
import { Dither, TimeWarpAnchor, type TimeWarpZone } from "@pp/ui/dither"
import { ArrowUpRight } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

import { instanceChangelog } from "../atoms/instance"
import { useWhatsNewSeen } from "../hooks/useWhatsNewSeen"
import { sectionTitle } from "../lib/changelogAreas"
import { displayVersion } from "../lib/displayVersion"
import {
  indexItems,
  releaseCounts,
  releaseDate,
  releaseFromHash,
  repositoryUrl,
  SECTION_IDS,
  SECTION_KINDS,
  sectionItems
} from "../lib/releaseView"
import { AnchorHeading } from "./AnchorHeading"
import { EarlierReleases } from "./EarlierReleases"
import { AreaRuns } from "./ReleaseChanges"
import { Highlights, Notices } from "./ReleaseHighlights"
import { ReleaseIndex } from "./ReleaseIndex"

const SCROLL_AFTER_MS = 120

const HERO_WARP_ZONES: TimeWarpZone[] = [
  { anchor: TimeWarpAnchor.click(), radius: 0.6, strength: 3.2, falloff: 3.5 }
]

export function ChangelogPage() {
  const changelog = useAtomValue(instanceChangelog)
  const refresh = useAtomRefresh(instanceChangelog)
  return (
    <AsyncView
      result={changelog}
      contained
      reset={refresh}
      onInitial={() => <SettingsSkeleton rows={3} />}
      onSuccess={({ value }) => {
        const [latest, ...earlier] = value.entries
        if (latest === undefined)
          return (
            <p className="text-body text-muted-foreground">
              {m.profile_changelog_empty()}
            </p>
          )
        return <LatestRelease latest={latest} earlier={earlier} />
      }}
    />
  )
}

// One release on its own page: an earlier release, opened from the list.
export function ReleasePage({ version }: Readonly<{ version: string }>) {
  const changelog = useAtomValue(instanceChangelog)
  const refresh = useAtomRefresh(instanceChangelog)
  return (
    <AsyncView
      result={changelog}
      contained
      reset={refresh}
      onInitial={() => <SettingsSkeleton rows={3} />}
      onSuccess={({ value }) => {
        const entry = value.entries.find(
          (candidate) => candidate.version === version
        )
        if (entry === undefined)
          return (
            <p className="text-body text-muted-foreground">
              {m.profile_changelog_release_missing()}
            </p>
          )
        return <Release entry={entry} earlier={[]} latest={false} />
      }}
    />
  )
}

function LatestRelease({
  latest,
  earlier
}: Readonly<{
  latest: ChangelogEntry
  earlier: ReadonlyArray<ChangelogEntry>
}>) {
  const hash = useLocation({ select: (location) => location.hash })
  const navigate = useNavigate()
  const { lastSeen, markSeen } = useWhatsNewSeen()

  useEffect(() => {
    if (lastSeen !== latest.version) markSeen(latest.version)
  }, [lastSeen, latest.version, markSeen])

  // Links from before releases had pages pointed at #release-<version>.
  const fromHash = releaseFromHash(`#${hash}`)
  useEffect(() => {
    if (fromHash !== null)
      void navigate({
        to: "/changelog/$version",
        params: { version: fromHash },
        replace: true
      })
  }, [fromHash, navigate])

  return <Release entry={latest} earlier={earlier} latest />
}

function Release({
  entry: latest,
  earlier,
  latest: isLatest
}: Readonly<{
  entry: ChangelogEntry
  earlier: ReadonlyArray<ChangelogEntry>
  latest: boolean
}>) {
  const reduce = useReducedMotion() ?? false
  const hash = useLocation({ select: (location) => location.hash })
  // The notices start closed; a link or index jump to them opens them.
  const [noticesOpen, setNoticesOpen] = useState(hash === SECTION_IDS.notices)
  const [seenHash, setSeenHash] = useState(hash)
  if (seenHash !== hash) {
    setSeenHash(hash)
    if (hash === SECTION_IDS.notices) setNoticesOpen(true)
  }

  useEffect(() => {
    if (hash === "") return undefined
    const timer = window.setTimeout(
      () => document.getElementById(hash)?.scrollIntoView({ block: "start" }),
      SCROLL_AFTER_MS
    )
    return () => window.clearTimeout(timer)
  }, [hash])

  const go = (id: string) => {
    if (id === SECTION_IDS.notices) setNoticesOpen(true)
    const url = new URL(window.location.href)
    url.hash = id
    window.history.replaceState(window.history.state, "", url)
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  }

  const index = indexItems(
    latest,
    {
      highlights: m.profile_changelog_highlights(),
      notices: m.profile_changelog_notices(),
      sections: {
        features: sectionTitle("features"),
        improvements: sectionTitle("improvements"),
        fixes: sectionTitle("fixes")
      },
      earlier: m.profile_changelog_earlier()
    },
    earlier.length > 0
  )
  const counts = releaseCounts(latest)
  const headlines = counts.highlights > 0
  const repository = repositoryUrl(latest.url)

  return (
    <div className="@container mx-auto flex w-full max-w-[56rem] flex-col gap-14 pb-24">
      <ReleaseHero entry={latest} latest={isLatest} />
      <div className="grid gap-12 @[52rem]:grid-cols-[minmax(0,42rem)_11rem] @[52rem]:justify-between">
        <div className="mx-auto flex w-full max-w-[42rem] min-w-0 flex-col gap-24 @[52rem]:mx-0">
          {latest.highlights.length === 0 ? null : (
            <Highlights highlights={latest.highlights} />
          )}
          {counts.changes === 0 ? null : (
            <div
              className={cn(
                "flex flex-col gap-10",
                headlines && "border-t border-border pt-10"
              )}
            >
              <p className="text-caption font-semibold text-muted-foreground tabular-nums">
                {headlines
                  ? m.profile_changelog_also()
                  : m.profile_changelog_in_release()}
                <span aria-hidden className="mx-1.5">
                  ·
                </span>
                {m.profile_changelog_changes({ count: counts.changes })}
              </p>
              <div className="flex flex-col gap-14">
                {SECTION_KINDS.map((kind) => {
                  const items = sectionItems(latest, kind)
                  if (items.length === 0) return null
                  return (
                    <section
                      key={kind}
                      id={SECTION_IDS[kind]}
                      className="flex scroll-mt-6 flex-col gap-8 border-border not-first:border-t not-first:pt-14"
                    >
                      <AnchorHeading
                        anchor={SECTION_IDS[kind]}
                        level="section"
                        label={sectionTitle(kind)}
                      >
                        {sectionTitle(kind)}
                        <span className="text-title font-normal text-muted-foreground tabular-nums">
                          {items.length}
                        </span>
                      </AnchorHeading>
                      <AreaRuns
                        items={items}
                        repository={repository}
                        density="full"
                      />
                    </section>
                  )
                })}
              </div>
            </div>
          )}
          {latest.notices.length === 0 ? null : (
            <Notices
              notices={latest.notices}
              open={noticesOpen}
              onToggle={() => setNoticesOpen((open) => !open)}
            />
          )}
          {earlier.length === 0 ? null : <EarlierReleases entries={earlier} />}
        </div>
        <aside className="hidden @[52rem]:block">
          <div className="sticky top-6">
            <ReleaseIndex items={index} onGo={go} />
          </div>
        </aside>
      </div>
    </div>
  )
}

function ReleaseHero({
  entry,
  latest
}: Readonly<{ entry: ChangelogEntry; latest: boolean }>) {
  const wellRef = useRef<HTMLDivElement | null>(null)
  const reduce = useReducedMotion() ?? false
  const date = releaseDate(entry.date, "long", getLocale())
  const counts = releaseCounts(entry)
  const parts = [
    counts.highlights === 0
      ? null
      : m.profile_changelog_count_highlights({ count: counts.highlights }),
    counts.features === 0
      ? null
      : m.profile_changelog_count_features({ count: counts.features }),
    counts.improvements === 0
      ? null
      : m.profile_changelog_count_improvements({ count: counts.improvements }),
    counts.fixes === 0
      ? null
      : m.profile_changelog_count_fixes({ count: counts.fixes })
  ].filter((part) => part !== null)
  return (
    // oxlint-disable-next-line shadcn/no-arbitrary-values -- the hero's well sits a step off the page so the dither reads against it
    <header className="@container/hero relative isolate flex min-h-[15rem] items-center justify-center overflow-hidden rounded-3xl bg-[color-mix(in_oklch,var(--background)_82%,var(--muted)_18%)] p-6 [corner-shape:var(--button-corner)]">
      <div aria-hidden className="absolute inset-0">
        <Dither
          disableAnimation={reduce}
          speed={reduce ? 0 : 0.08}
          octaves={5}
          frequency={1.4}
          amplitude={0.55}
          lacunarity={2.2}
          rotationAngle={0.4}
          warpStrength={1.2}
          contrast={0.25}
          bias={-0.05}
          colorFront="var(--dither-front)"
          seed={entry.version.length * 7}
          pixelSize={2}
          ditherType="4x4"
          cardRef={wellRef}
          cardWellEnabled
          cardFalloff={72}
          cardCornerRadius={20}
          timeWarpZones={HERO_WARP_ZONES}
        />
      </div>
      <div
        ref={wellRef}
        className="relative flex flex-col items-center px-10 py-7 text-center"
      >
        <p className="text-caption font-semibold text-muted-foreground">
          {entry.channel === "nightly"
            ? m.profile_changelog_nightly()
            : latest
              ? m.profile_changelog_latest()
              : m.profile_changelog_release()}
        </p>
        {/* oxlint-disable-next-line shadcn/no-arbitrary-values -- the version number is the page's poster: it grows with the page past the top of the type scale */}
        <h1 className="mt-2 text-[clamp(2.75rem,2rem+3vw,4.25rem)] leading-none font-semibold tabular-nums">
          {displayVersion(entry.version)}
        </h1>
        {date === null ? null : (
          <time
            dateTime={entry.date}
            className="mt-4 text-title font-normal text-foreground"
          >
            {date}
          </time>
        )}
        <p className="mt-1.5 hidden flex-wrap justify-center gap-x-2 text-body text-muted-foreground tabular-nums @[26rem]/hero:flex">
          {parts.map((part, index) => (
            <span key={part} className="flex gap-2 whitespace-nowrap">
              {index === 0 ? null : <span aria-hidden>·</span>}
              {part}
            </span>
          ))}
        </p>
        <ul className="mt-1.5 grid grid-cols-2 gap-x-5 text-body text-muted-foreground tabular-nums @[26rem]/hero:hidden">
          {parts.map((part, index) => (
            <li
              key={part}
              className={cn(
                "whitespace-nowrap",
                index % 2 === 0 ? "text-right" : "text-left",
                index === parts.length - 1 &&
                  index % 2 === 0 &&
                  "col-span-2 text-center"
              )}
            >
              {part}
            </li>
          ))}
        </ul>
        <a
          href={entry.url}
          target="_blank"
          rel="noreferrer"
          className="focus-ring mt-4 inline-flex items-center gap-1 rounded-sm text-caption font-semibold text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          {m.profile_changelog_on_github()}
          <ArrowUpRight aria-hidden className="size-3.5" />
        </a>
      </div>
    </header>
  )
}
