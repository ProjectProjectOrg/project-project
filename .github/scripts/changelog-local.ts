import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { parseArgs } from "node:util"

import * as Schema from "effect/Schema"

import {
  Changelog,
  type ChangelogEntry
} from "../../packages/shared/src/changelog/Changelog"
import { MEDIA_DIR, videoFiles, videoProblems } from "./changesets"
import {
  buildEntry,
  checkReport,
  checkRelease,
  hasErrors,
  parsedFiles,
  type ReleaseFile
} from "./releaseNotes"
import {
  changesetsAddedSince,
  commitAdding,
  git,
  lastStableTag,
  prFromSubject,
  readReleaseFiles
} from "./releaseSource"

const CHANGELOG_FILE = "changelog.json"
const MEDIA_OUT = "changelog-media"
const PR_MAP = "pr-map.json"
const NOT_CHANGESETS = new Set(["README.md", "REPORT.md"])
const FALLBACK_REPO = "ProjectProjectOrg/project-project"

const PrMap = Schema.Record(Schema.String, Schema.Finite)
const decodePrMap = Schema.decodeUnknownSync(Schema.fromJsonString(PrMap))
const decodeChangelog = Schema.decodeUnknownSync(
  Schema.fromJsonString(Changelog)
)

const usage = `Usage:
  bun run changelog:check   [--dir <folder>] [--hotfix]
  bun run changelog:preview [--dir <folder>] [--version <v> --date <YYYY-MM-DD>]

Without --dir: the changesets added since the last stable tag, in the working tree.
--version writes a regular entry for that version instead of the preview.`

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    dir: { type: "string" },
    hotfix: { type: "boolean", default: false },
    version: { type: "string" },
    date: { type: "string" }
  }
})
const [command] = positionals
if (command !== "check" && command !== "preview") {
  console.error(usage)
  process.exit(1)
}

const repo = (() => {
  try {
    const [url = ""] = git("remote", "get-url", "origin")
    return /github\.com[:/](.+?)(?:\.git)?$/.exec(url)?.[1] ?? FALLBACK_REPO
  } catch {
    return FALLBACK_REPO
  }
})()

const stableTag = lastStableTag("HEAD")

const prMapOf = async (dir: string) =>
  readFile(join(dir, PR_MAP), "utf8").then(decodePrMap, () => ({}))

const folderFiles = async (dir: string) => {
  const prs: Readonly<Record<string, number>> = await prMapOf(dir)
  const paths = (await readdir(dir))
    .filter((name) => name.endsWith(".md") && !NOT_CHANGESETS.has(name))
    .toSorted()
    .map((name) => join(dir, name))
  return readReleaseFiles(paths, async (path) => prs[basename(path)] ?? null)
}

const workingTreeFiles = () =>
  readReleaseFiles(changesetsAddedSince(stableTag, null), async (path) => {
    const commit = commitAdding(path, "HEAD")
    return commit === null ? null : prFromSubject(commit.subject)
  })

const files: ReadonlyArray<ReleaseFile> =
  values.dir === undefined
    ? await workingTreeFiles()
    : await folderFiles(values.dir)

const source =
  values.dir === undefined
    ? `${files.length} changesets added since ${stableTag ?? "the first commit"}`
    : `${files.length} changesets in ${values.dir}`

const problems = checkRelease({
  files,
  videos: await videoProblems(
    parsedFiles(files).flatMap(({ changeset }) =>
      changeset.video === null ? [] : [changeset.video]
    )
  ),
  hotfix: values.hotfix
})

const amsterdamDay = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" })
    .format(date)
    .replaceAll("-", ".")

const nextVersion = () => {
  const day = `v${amsterdamDay(new Date())}`
  const taken = new Set(git("tag", "--list", `${day}*`))
  if (!taken.has(day)) return day
  const sequence = Array.from({ length: 98 }, (_, index) => index + 2).find(
    (n) => !taken.has(`${day}.${n}`)
  )
  return `${day}.${sequence}`
}

// Only the preview links to a comparison; released entries link to their tag.
const isPreview = (entry: ChangelogEntry) => entry.url.includes("/compare/")

const previewEntry = () =>
  buildEntry({
    version: nextVersion(),
    channel: "stable",
    date: new Date().toISOString(),
    url: `https://github.com/${repo}/compare/${stableTag ?? "main"}...main`,
    changesets: parsedFiles(files)
  })

const releasedEntry = (version: string, date: string) =>
  buildEntry({
    version,
    channel: "stable",
    date: new Date(`${date}T12:00:00Z`).toISOString(),
    url: `https://github.com/${repo}/releases/tag/${version}`,
    changesets: parsedFiles(files)
  })

const withMedia = async (entry: ChangelogEntry) => {
  await mkdir(MEDIA_OUT, { recursive: true })
  const copied = (file: string) =>
    copyFile(`${MEDIA_DIR}/${file}`, `${MEDIA_OUT}/${file}`).then(
      () => true,
      () => false
    )
  const present = async (video: string | null) =>
    video !== null &&
    (await Promise.all(videoFiles(video).map(copied))).every(Boolean)
  return {
    ...entry,
    highlights: await Promise.all(
      entry.highlights.map(async (highlight) => ({
        ...highlight,
        video: (await present(highlight.video)) ? highlight.video : null
      }))
    )
  }
}

const localChangelog = () =>
  readFile(CHANGELOG_FILE, "utf8").then(
    (text) => {
      try {
        return decodeChangelog(text)
      } catch {
        console.log(
          `${CHANGELOG_FILE} is in an older format; starting a new one.`
        )
        return { entries: [] }
      }
    },
    () => ({ entries: [] })
  )

const preview = async () => {
  if (values.version !== undefined && values.date === undefined) {
    console.error("--version needs --date <YYYY-MM-DD>")
    process.exit(1)
  }
  const entry = await withMedia(
    values.version === undefined || values.date === undefined
      ? previewEntry()
      : releasedEntry(values.version, values.date)
  )
  const kept = (await localChangelog()).entries.filter((other) =>
    values.version === undefined
      ? !isPreview(other)
      : other.version !== entry.version
  )
  const entries = [entry, ...kept].toSorted((a, b) =>
    b.date.localeCompare(a.date)
  )
  await writeFile(CHANGELOG_FILE, `${JSON.stringify({ entries }, null, 2)}\n`)
  const lines = entry.sections.reduce(
    (count, section) => count + section.items.length,
    0
  )
  console.log(
    `Wrote ${entry.version} to ${CHANGELOG_FILE} (${entries.length} entries): ${entry.highlights.length} highlights, ${entry.notices.length} notices, ${lines} lines. Videos: ${
      entry.highlights
        .map((highlight) => highlight.video ?? "none")
        .join(", ") || "none"
    }.`
  )
}

console.log(source)
if (command === "preview") await preview()
console.log(checkReport(problems))
if (command === "check" && hasErrors(problems)) process.exit(1)
