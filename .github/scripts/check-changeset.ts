import { appendFile, readFile } from "node:fs/promises"

import {
  type Changeset,
  isChangesetPath,
  parseChangeset,
  videoProblem
} from "./changesets"
import { AREA_TITLES, SECTION_TITLES } from "./releaseNotes"

const changesetsIn = (name: string) =>
  (process.env[name] ?? "").split("\n").filter(isChangesetPath)

// A pull request must add a changeset, and may edit one no stable has
// shipped yet, so both are checked.
const added = changesetsIn("ADDED_FILES")
const checked = [...new Set([...added, ...changesetsIn("MODIFIED_FILES")])]

const results = await Promise.all(
  checked.map(async (path) => {
    const parsed = parseChangeset(await readFile(path, "utf8"))
    if (!parsed.ok) return { path, changeset: null, problem: parsed.problem }
    const video =
      parsed.changeset.video === null
        ? null
        : await videoProblem(parsed.changeset.video)
    return { path, changeset: parsed.changeset, problem: video }
  })
)

const placement = (changeset: Changeset) =>
  changeset.kind === "internal"
    ? "Internal: left out of the release notes"
    : changeset.highlight
      ? `Highlight${changeset.rank === null ? "" : ` ${changeset.rank}`}`
      : changeset.notice
        ? "Before you update"
        : SECTION_TITLES[changeset.kind]

const escaped = (text: string) => text.replaceAll("|", "\\|")

const row = ({ path, changeset, problem }: (typeof results)[number]) =>
  changeset === null
    ? `| \`${path}\` | | | | ${escaped(problem ?? "")} |`
    : `| \`${path}\` | ${placement(changeset)} | ${changeset.area === null ? "" : AREA_TITLES[changeset.area]} | ${escaped(changeset.text)} | ${escaped(problem ?? "")} |`

const summary = [
  "### Changesets",
  "",
  "How each line will appear in the release notes and on the changelog page.",
  "",
  "| File | Shows as | Area | Line | Problem |",
  "| --- | --- | --- | --- | --- |",
  ...results.map(row),
  ...(added.length === 0
    ? ["", "**Problem:** this pull request adds no changeset."]
    : [])
].join("\n")

const summaryFile = process.env.GITHUB_STEP_SUMMARY ?? ""
if (summaryFile !== "") await appendFile(summaryFile, `${summary}\n`)

const invalid = results.flatMap(({ path, problem }) =>
  problem === null ? [] : [`${path}: ${problem}`]
)
if (invalid.length > 0) {
  for (const problem of invalid) console.log(`::error::${problem}`)
  process.exit(1)
}
if (added.length === 0) {
  console.log(
    "::error::Every pull request adds a changeset: .changeset/<short-name>.md, as described in .changeset/README.md. Internal-only changes use kind: internal."
  )
  process.exit(1)
}
console.log(`Changesets: ${checked.join(", ")}`)
