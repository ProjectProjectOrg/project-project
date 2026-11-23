import { stat } from "node:fs/promises"

import {
  CHANGELOG_AREAS,
  CHANGELOG_VIDEO_NAME,
  CHANGELOG_VIDEO_THEMES,
  type ChangelogArea,
  type ChangelogSectionKind,
  changelogVideoFile
} from "../../packages/shared/src/changelog/Changelog"

export const CHANGESET_DIR = ".changeset"
export const MEDIA_DIR = `${CHANGESET_DIR}/media`
export const MAX_VIDEO_BYTES = 3 * 1024 * 1024
export const MAX_SUMMARY_WORDS = 20
export const MAX_HIGHLIGHTS = 3

export type ChangesetKind = ChangelogSectionKind | "internal"

export type Changeset = Readonly<{
  kind: ChangesetKind
  area: ChangelogArea | null
  highlight: boolean
  rank: number | null
  notice: boolean
  video: string | null
  where: string | null
  pr: number | null
  prs: ReadonlyArray<number>
  follows: number | null
  text: string
  body: string
}>

export type ParsedChangeset =
  | Readonly<{ ok: true; changeset: Changeset }>
  | Readonly<{ ok: false; problem: string }>

// Changesets sit directly in `.changeset/`; folders under it hold other things.
export const isChangesetPath = (path: string) =>
  path.startsWith(`${CHANGESET_DIR}/`) &&
  !path.slice(CHANGESET_DIR.length + 1).includes("/") &&
  path.endsWith(".md") &&
  path !== `${CHANGESET_DIR}/README.md`

const KINDS: ReadonlySet<string> = new Set([
  "features",
  "improvements",
  "fixes",
  "internal"
])
const FIELDS: ReadonlyArray<string> = [
  "kind",
  "area",
  "highlight",
  "video",
  "where",
  "notice",
  "pr",
  "prs",
  "follows"
]
const DROPPED_FIELDS: ReadonlySet<string> = new Set(["layout", "value"])

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
const PULL_REQUESTS = /^#?\d+(?:\s*,\s*#?\d+)*$/
const PULL_REQUEST = /^#?\d+$/

const fail = (problem: string) =>
  ({ ok: false, problem }) satisfies ParsedChangeset

const unquote = (value: string) =>
  value.replace(/^(["'])((?:(?!\1).)*)\1$/, "$2")

const numbersOf = (list: string) =>
  list.split(",").map((part) => Number(part.trim().replace("#", "")))

const wordCount = (text: string) => text.split(/\s+/).length

const isArea = (value: string): value is ChangelogArea =>
  CHANGELOG_AREAS.some((area) => area === value)

const isKind = (value: string): value is ChangesetKind => KINDS.has(value)

const fieldsOf = (frontmatter: string) =>
  frontmatter.split("\n").flatMap((line) => {
    const at = line.indexOf(":")
    return line.trim() === "" || line.trimStart().startsWith("#")
      ? []
      : [
          [
            (at === -1 ? line : line.slice(0, at)).trim(),
            at === -1 ? "" : unquote(line.slice(at + 1).trim())
          ] as const
        ]
  })

const fieldProblem = (fields: ReadonlyArray<readonly [string, string]>) => {
  const names = fields.map(([name]) => name)
  const dropped = names.find((name) => DROPPED_FIELDS.has(name))
  if (dropped !== undefined)
    return `${dropped} is gone: a highlight and a notice each have one fixed look, and every other change is a line with an area. Remove ${dropped}`
  const unknown = names.find((name) => !FIELDS.includes(name))
  if (unknown !== undefined)
    return `unknown field "${unknown}"; the fields are ${FIELDS.join(", ")}`
  const repeated = names.find((name, index) => names.indexOf(name) !== index)
  return repeated === undefined ? null : `${repeated} is set twice`
}

const rankOf = (highlight: string) =>
  highlight === "true" ? null : Number(highlight)

export const parseChangeset = (source: string) => {
  const match = FRONTMATTER.exec(source.replaceAll("\r\n", "\n"))
  if (match === null) return fail("missing the --- frontmatter block")
  const entries = fieldsOf(match[1])
  const problem = fieldProblem(entries)
  if (problem !== null) return fail(problem)
  const fields = new Map(entries)
  const kind = fields.get("kind")
  const area = fields.get("area")
  const highlight = fields.get("highlight")
  const notice = fields.get("notice")
  const video = fields.get("video")
  const where = fields.get("where")
  const pr = fields.get("pr")
  const prs = fields.get("prs")
  const follows = fields.get("follows")
  const [first = "", ...rest] = match[2].trim().split("\n")
  const text = first.trim()
  const body = rest.join("\n").trim()

  if (kind === undefined || !isKind(kind))
    return fail("kind is features, improvements, fixes or internal")
  if (text === "") return fail("the first line is the one-line summary")
  if (text.endsWith(".")) return fail("the summary ends without a period")
  if (wordCount(text) > MAX_SUMMARY_WORDS)
    return fail(
      `the summary is ${wordCount(text)} words; keep it to ${MAX_SUMMARY_WORDS}`
    )
  if (/^you can now\b/i.test(text))
    return fail(
      'the summary starts with what people can do ("Drag tickets between sprints"), not with "You can now"'
    )
  if (pr !== undefined && !PULL_REQUEST.test(pr))
    return fail("pr is one pull request number: 498")
  if (prs !== undefined && !PULL_REQUESTS.test(prs))
    return fail("prs is pull request numbers with commas between: 466, 471")
  if (follows !== undefined && !PULL_REQUEST.test(follows))
    return fail("follows is one pull request number: 466")

  if (kind === "internal") {
    const extra = ["area", "highlight", "notice", "video", "where"].find(
      (name) => fields.has(name)
    )
    if (extra !== undefined)
      return fail(
        `an internal changeset is left out of the release notes, so it has no ${extra}`
      )
    if (body !== "")
      return fail(
        "an internal changeset is one line; a body belongs to a highlight or a notice"
      )
  } else {
    if (follows !== undefined)
      return fail(
        "follows goes on an internal changeset; the pull request it names keeps the line"
      )
    if (area === undefined || !isArea(area))
      return fail(
        `area is required: one of ${CHANGELOG_AREAS.join(", ")} (see "Areas" in .changeset/README.md)`
      )
  }

  if (highlight !== undefined && !/^(?:true|[1-3])$/.test(highlight))
    return fail(
      "highlight is true, or a rank 1, 2 or 3 (1 leads); leave it out for a plain line"
    )
  if (notice !== undefined && notice !== "true")
    return fail("notice is true; leave it out for a plain line")
  if (highlight !== undefined && notice !== undefined)
    return fail(
      "a change is a highlight or a notice, not both; a breaking change is a notice"
    )
  if (highlight !== undefined && video === undefined)
    return fail(
      "a highlight needs a video: video: <name>, for .changeset/media/<name>.light.mp4 and .dark.mp4"
    )
  if (video !== undefined && highlight === undefined)
    return fail("video belongs to a highlight; add highlight or remove video")
  if (where !== undefined && highlight === undefined)
    return fail("where belongs to a highlight; add highlight or remove where")
  if (video !== undefined && !CHANGELOG_VIDEO_NAME.test(video))
    return fail(
      "video is a kebab-case name; its files are <name>.light.mp4 and <name>.dark.mp4 in .changeset/media"
    )
  if ((highlight !== undefined || notice !== undefined) && body === "")
    return fail(
      `a ${highlight === undefined ? "notice" : "highlight"} needs a body: a sentence or two under the first line`
    )
  if (highlight === undefined && notice === undefined && body !== "")
    return fail(
      "a plain line has no body; only a highlight or a notice has one"
    )

  return {
    ok: true,
    changeset: {
      kind,
      area: area !== undefined && isArea(area) ? area : null,
      highlight: highlight !== undefined,
      rank: highlight === undefined ? null : rankOf(highlight),
      notice: notice !== undefined,
      video: video ?? null,
      where: where ?? null,
      pr: pr === undefined ? null : numbersOf(pr)[0],
      prs: prs === undefined ? [] : numbersOf(prs),
      follows: follows === undefined ? null : numbersOf(follows)[0],
      text,
      body
    }
  } satisfies ParsedChangeset
}

// The files of a highlight's video: one per theme.
export const videoFiles = (video: string) =>
  CHANGELOG_VIDEO_THEMES.map((theme) => changelogVideoFile(video, theme))

const fileProblem = async (file: string) => {
  const size = await stat(`${MEDIA_DIR}/${file}`).then(
    (info) => info.size,
    () => null
  )
  if (size === null) return `${MEDIA_DIR}/${file} does not exist`
  return size > MAX_VIDEO_BYTES
    ? `${MEDIA_DIR}/${file} is over 3 MB; shorten or compress it`
    : null
}

// Both themes must exist, so the video always matches the app around it.
export const videoProblem = async (video: string) => {
  const problems = await Promise.all(videoFiles(video).map(fileProblem))
  const found = problems.filter((problem) => problem !== null)
  return found.length === 0 ? null : found.join("; ")
}

export const videoProblems = async (videos: ReadonlyArray<string>) =>
  new Map(
    await Promise.all(
      [...new Set(videos)].map(
        async (video) => [video, await videoProblem(video)] as const
      )
    )
  )
