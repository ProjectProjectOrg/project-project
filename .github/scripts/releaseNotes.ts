import {
  CHANGELOG_AREAS,
  CHANGELOG_VIDEO_THEMES,
  type ChangelogArea,
  type ChangelogChannel,
  type ChangelogEntry,
  type ChangelogItem,
  type ChangelogSection,
  type ChangelogSectionKind,
  changelogVideoFile
} from "../../packages/shared/src/changelog/Changelog"
import {
  type Changeset,
  MAX_HIGHLIGHTS,
  MEDIA_DIR,
  type ParsedChangeset
} from "./changesets"

// `pr`: the file's own `pr`, else the pull request that added the file.
export type ReleaseFile = Readonly<{
  file: string
  parsed: ParsedChangeset
  pr: number | null
}>

export type ReleaseChangeset = Readonly<{
  file: string
  changeset: Changeset
  pr: number | null
}>

export type PullRequest = Readonly<{ number: number; title: string }>

export type Problem = Readonly<{
  level: "error" | "warning"
  file: string | null
  message: string
}>

export const SECTION_ORDER = ["features", "improvements", "fixes"] as const

export const SECTION_TITLES = {
  features: "New",
  improvements: "Improved",
  fixes: "Fixed"
} satisfies Readonly<Record<ChangelogSectionKind, string>>

export const AREA_TITLES = {
  tickets: "Tickets",
  lists: "Lists",
  sprints: "Sprints",
  comments: "Comments",
  editor: "Editor",
  projects: "Projects",
  people: "People",
  integrations: "Integrations",
  agents: "Agents",
  navigation: "Navigation",
  appearance: "Appearance",
  "self-hosting": "Self-hosting"
} satisfies Readonly<Record<ChangelogArea, string>>

const KIND_BY_TYPE = new Map<string, ChangelogSectionKind>([
  ["feat", "features"],
  ["perf", "improvements"],
  ["fix", "fixes"]
])

const CONVENTIONAL = /^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/

export const parsedFiles = (files: ReadonlyArray<ReleaseFile>) =>
  files.flatMap(({ file, parsed, pr }) =>
    parsed.ok
      ? [{ file, changeset: parsed.changeset, pr } satisfies ReleaseChangeset]
      : []
  )

const unique = (numbers: ReadonlyArray<number>) => [...new Set(numbers)]

const ownPrs = ({ changeset, pr }: ReleaseChangeset) =>
  unique(pr === null ? changeset.prs : [pr, ...changeset.prs])

const isUserFacing = ({ changeset }: ReleaseChangeset) =>
  changeset.kind !== "internal"

// Own pull requests plus internal follow-ups whose `follows` names one of them.
const linePrs = (
  line: ReleaseChangeset,
  all: ReadonlyArray<ReleaseChangeset>
) => {
  const own = ownPrs(line)
  const followers = all.flatMap(({ changeset, pr }) =>
    changeset.follows !== null && pr !== null && own.includes(changeset.follows)
      ? [pr]
      : []
  )
  return unique([...own, ...followers])
}

const highlightOrder = (a: ReleaseChangeset, b: ReleaseChangeset) =>
  (a.changeset.rank ?? MAX_HIGHLIGHTS + 1) -
    (b.changeset.rank ?? MAX_HIGHLIGHTS + 1) || a.file.localeCompare(b.file)

const areaIndex = (area: ChangelogArea | null) =>
  area === null ? CHANGELOG_AREAS.length : CHANGELOG_AREAS.indexOf(area)

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)

type Line = Readonly<{ kind: ChangelogSectionKind; item: ChangelogItem }>

const titleLine = (pr: PullRequest) => {
  const match = CONVENTIONAL.exec(pr.title)
  const line = (kind: ChangelogSectionKind, text: string) =>
    [
      { kind, item: { text, area: null, prs: [pr.number] } }
    ] satisfies ReadonlyArray<Line>
  if (match === null) return line("improvements", capitalize(pr.title))
  const kind = KIND_BY_TYPE.get(match[1].toLowerCase())
  return kind === undefined ? [] : line(kind, capitalize(match[2]))
}

export type EntryInput = Readonly<{
  version: string
  channel: ChangelogChannel
  date: string
  url: string
  changesets: ReadonlyArray<ReleaseChangeset>
  // Merged pull requests; those no changeset covers become lines from their titles.
  pullRequests?: ReadonlyArray<PullRequest>
}>

export const buildEntry = (input: EntryInput) => {
  const all = input.changesets
  const userFacing = all.filter(isUserFacing)
  const covered = new Set(
    all.flatMap((line) => [
      ...ownPrs(line),
      ...(line.changeset.follows === null ? [] : [line.changeset.follows])
    ])
  )
  const highlights = userFacing
    .filter(({ changeset }) => changeset.highlight)
    .toSorted(highlightOrder)
    .map((line) => ({
      text: line.changeset.text,
      body: line.changeset.body,
      area: line.changeset.area,
      where: line.changeset.where,
      video: line.changeset.video,
      prs: linePrs(line, all)
    }))
  const notices = userFacing
    .filter(({ changeset }) => changeset.notice)
    .map((line) => ({
      text: line.changeset.text,
      body: line.changeset.body,
      prs: linePrs(line, all)
    }))
  const lines = [
    ...userFacing.flatMap((line) =>
      line.changeset.highlight ||
      line.changeset.notice ||
      line.changeset.kind === "internal"
        ? []
        : [
            {
              kind: line.changeset.kind,
              item: {
                text: line.changeset.text,
                area: line.changeset.area,
                prs: linePrs(line, all)
              }
            }
          ]
    ),
    ...(input.pullRequests ?? [])
      .filter((pr) => !covered.has(pr.number))
      .flatMap(titleLine)
  ]
  const sections = SECTION_ORDER.flatMap((kind) => {
    const items = lines
      .flatMap((line) => (line.kind === kind ? [line.item] : []))
      .toSorted((a, b) => areaIndex(a.area) - areaIndex(b.area))
    return items.length === 0
      ? []
      : [{ kind, items } satisfies ChangelogSection]
  })
  return {
    version: input.version,
    channel: input.channel,
    date: input.date,
    url: input.url,
    highlights,
    notices,
    sections
  } satisfies ChangelogEntry
}

export type MarkdownContext = Readonly<{
  repo: string
  // The commit whose `.changeset/media` the video links point at.
  sha: string
  previousTag: string | null
  tag: string | null
}>

const prLinks = (prs: ReadonlyArray<number>, repo: string) =>
  prs.length === 0
    ? ""
    : ` (${prs.map((pr) => `[#${pr}](https://github.com/${repo}/pull/${pr})`).join(", ")})`

const watchLinks = (video: string, { repo, sha }: MarkdownContext) =>
  CHANGELOG_VIDEO_THEMES.map(
    (theme) =>
      `[${theme}](https://github.com/${repo}/blob/${sha}/${MEDIA_DIR}/${changelogVideoFile(video, theme)})`
  ).join(" · ")

const areaRuns = (items: ReadonlyArray<ChangelogItem>) =>
  [...new Set(items.map((item) => item.area))].map((area) => ({
    area,
    items: items.filter((item) => item.area === area)
  }))

const sectionMarkdown = (section: ChangelogSection, repo: string) => {
  const runs = areaRuns(section.items)
  const list = (items: ReadonlyArray<ChangelogItem>) =>
    items.map((item) => `- ${item.text}${prLinks(item.prs, repo)}`).join("\n")
  const body =
    runs.length === 1 && runs[0].area === null
      ? list(section.items)
      : runs
          .map(
            ({ area, items }) =>
              `### ${area === null ? "Other" : AREA_TITLES[area]}\n\n${list(items)}`
          )
          .join("\n\n")
  return `## ${SECTION_TITLES[section.kind]}\n\n${body}`
}

export const releaseMarkdown = (
  entry: ChangelogEntry,
  context: MarkdownContext
) => {
  const highlights = entry.highlights.map((highlight) =>
    [
      `### ${highlight.text}`,
      highlight.body,
      highlight.where === null ? "" : `**Where:** ${highlight.where}`,
      [
        highlight.video === null
          ? ""
          : `Video: ${watchLinks(highlight.video, context)}`,
        prLinks(highlight.prs, context.repo).trim()
      ]
        .filter((part) => part !== "")
        .join(" ")
    ]
      .filter((part) => part !== "")
      .join("\n\n")
  )
  const notices = entry.notices.map(
    (notice) =>
      `### ${notice.text}\n\n${notice.body}${prLinks(notice.prs, context.repo)}`
  )
  const parts = [
    highlights.length === 0
      ? ""
      : `## Highlights\n\n${highlights.join("\n\n")}`,
    notices.length === 0
      ? ""
      : `## Before you update\n\n${notices.join("\n\n")}`,
    ...entry.sections.map((section) => sectionMarkdown(section, context.repo)),
    context.previousTag !== null && context.tag !== null
      ? `**Full changelog**: https://github.com/${context.repo}/compare/${context.previousTag}...${context.tag}`
      : ""
  ]
  return `${parts.filter((part) => part !== "").join("\n\n")}\n`
}

export type CheckInput = Readonly<{
  files: ReadonlyArray<ReleaseFile>
  // Problems with each highlight video's files, by video name; null if fine.
  videos: ReadonlyMap<string, string | null>
  // A hotfix stable may ship without a highlight.
  hotfix: boolean
}>

const error = (file: string | null, message: string) =>
  ({ level: "error", file, message }) satisfies Problem

const normalized = (text: string) => text.trim().toLowerCase()

export const checkRelease = ({ files, videos, hotfix }: CheckInput) => {
  const parseErrors = files.flatMap(({ file, parsed }) =>
    parsed.ok ? [] : [error(file, parsed.problem)]
  )
  const all = parsedFiles(files)
  const userFacing = all.filter(isUserFacing)
  const highlights = userFacing.filter(({ changeset }) => changeset.highlight)
  const ranked = highlights.flatMap(({ file, changeset }) =>
    changeset.rank === null ? [] : [{ file, rank: changeset.rank }]
  )
  const count = highlights.length

  const empty =
    userFacing.length === 0
      ? [
          error(
            null,
            "no user-facing changesets: a stable release needs at least one line"
          )
        ]
      : []
  const highlightCount =
    count === 0 && !hotfix
      ? [
          error(
            null,
            "no highlight: mark the headline change highlight: 1 (only a hotfix may ship without one)"
          )
        ]
      : count > MAX_HIGHLIGHTS && !hotfix
        ? [
            error(
              null,
              `${count} highlights (${highlights.map(({ file }) => file).join(", ")}); keep ${MAX_HIGHLIGHTS} at most and make the others plain lines`
            )
          ]
        : []
  // A hotfix ships whatever main holds; curating highlights waits for the
  // next regular stable, so their count and ranks don't block it.
  const unranked =
    count > 1 && !hotfix
      ? highlights.flatMap(({ file, changeset }) =>
          changeset.rank === null
            ? [
                error(
                  file,
                  `one of ${count} highlights: give it a rank (highlight: 1, 2 or 3)`
                )
              ]
            : []
        )
      : []
  const sharedRanks = ranked.flatMap(({ file, rank }, index) =>
    hotfix || ranked.findIndex((other) => other.rank === rank) === index
      ? []
      : [
          error(
            file,
            `highlight rank ${rank} is taken by ${ranked.find((other) => other.rank === rank)?.file}; ranks are distinct`
          )
        ]
  )
  const videoErrors = highlights.flatMap(({ file, changeset }) => {
    const problem =
      changeset.video === null ? null : (videos.get(changeset.video) ?? null)
    return problem === null ? [] : [error(file, problem)]
  })
  const duplicates = userFacing.flatMap(({ file, changeset }, index) => {
    const first = userFacing.findIndex(
      (other) => normalized(other.changeset.text) === normalized(changeset.text)
    )
    return first === index
      ? []
      : [
          error(
            file,
            `same line as ${userFacing[first].file}: fold them into one and name both pull requests in prs`
          )
        ]
  })
  const withLines = new Set(userFacing.flatMap(ownPrs))
  const strayFollows = all.flatMap(({ file, changeset }) =>
    changeset.follows === null || withLines.has(changeset.follows)
      ? []
      : [
          error(
            file,
            `follows #${changeset.follows}, which has no line in this release; if it shipped in an earlier stable, give this change its own line`
          )
        ]
  )
  const noPr = userFacing.flatMap(({ file, changeset, pr }) =>
    pr === null && changeset.prs.length === 0
      ? [
          {
            level: "warning",
            file,
            message: "no pull request found for this line; add pr: <number>"
          } satisfies Problem
        ]
      : []
  )
  return [
    ...parseErrors,
    ...empty,
    ...highlightCount,
    ...unranked,
    ...sharedRanks,
    ...videoErrors,
    ...duplicates,
    ...strayFollows,
    ...noPr
  ] satisfies ReadonlyArray<Problem>
}

export const hasErrors = (problems: ReadonlyArray<Problem>) =>
  problems.some((problem) => problem.level === "error")

const problemLine = (problem: Problem) =>
  `${problem.level === "error" ? "Error" : "Warning"}: ${problem.file === null ? "" : `${problem.file}: `}${problem.message}`

export const checkSummary = (problems: ReadonlyArray<Problem>) => {
  const errors = problems.filter((problem) => problem.level === "error").length
  const warnings = problems.length - errors
  return problems.length === 0
    ? "Release check passed."
    : `Release check: ${errors} ${errors === 1 ? "error" : "errors"}, ${warnings} ${warnings === 1 ? "warning" : "warnings"}.`
}

export const checkReport = (problems: ReadonlyArray<Problem>) =>
  [checkSummary(problems), ...problems.map(problemLine)].join("\n")

export const checkMarkdown = (problems: ReadonlyArray<Problem>) =>
  [
    `**${checkSummary(problems)}**`,
    ...(problems.length === 0
      ? []
      : [
          problems
            .map(
              (problem) =>
                `- **${problem.level === "error" ? "Error" : "Warning"}**${problem.file === null ? "" : ` \`${problem.file}\``}: ${problem.message}`
            )
            .join("\n")
        ])
  ].join("\n\n")
