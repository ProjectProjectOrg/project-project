import { appendFile, copyFile, mkdir, writeFile } from "node:fs/promises"

import * as Schema from "effect/Schema"

import {
  Changelog,
  ChangelogChannel
} from "../../packages/shared/src/changelog/Changelog"
import { MEDIA_DIR, videoFiles, videoProblems } from "./changesets"
import {
  buildEntry,
  checkMarkdown,
  checkReport,
  checkRelease,
  hasErrors,
  parsedFiles,
  type Problem,
  type ReleaseFile,
  releaseMarkdown
} from "./releaseNotes"
import {
  changesetsAddedSince,
  commitAdding,
  lastStableTag,
  prFromSubject,
  readReleaseFiles
} from "./releaseSource"

const KEEP_ENTRIES = 30
const OUT_DIR = "dist/release"
const DRAFT_NAME = "Next stable (draft)"
const DRAFT_TAG = "next-stable"
const MAX_RELEASE_BODY = 120_000

const GeneratedNotes = Schema.Struct({ body: Schema.String })
const Release = Schema.Struct({
  assets: Schema.Array(
    Schema.Struct({ name: Schema.String, url: Schema.String })
  )
})
const Releases = Schema.Array(
  Schema.Struct({
    id: Schema.Finite,
    name: Schema.NullOr(Schema.String),
    draft: Schema.Boolean
  })
)
const CommitPulls = Schema.Array(Schema.Struct({ number: Schema.Finite }))

const decodeGeneratedNotes = Schema.decodeUnknownSync(GeneratedNotes)
const decodeRelease = Schema.decodeUnknownSync(Release)
const decodeReleases = Schema.decodeUnknownSync(Releases)
const decodeCommitPulls = Schema.decodeUnknownSync(CommitPulls)
const decodeChangelog = Schema.decodeUnknownSync(
  Schema.fromJsonString(Changelog)
)
const decodeChannel = Schema.decodeUnknownSync(ChangelogChannel)

const env = (name: string) => process.env[name] ?? ""
const repo = env("GITHUB_REPOSITORY")
const tag = env("TAG")
const previousTag = env("PREVIOUS_TAG") || null
const channel = decodeChannel(env("CHANNEL"))
const sha = env("SHA")
const hotfix = env("HOTFIX") === "true"

const github = async (path: string, init?: RequestInit) => {
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method: init?.method,
    body: init?.body,
    headers: {
      authorization: `Bearer ${env("GH_TOKEN")}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28"
    }
  })
  if (!response.ok)
    throw new Error(
      `GitHub ${init?.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`
    )
  return response.json()
}

const PR_LINE = /^\* (.+) by @\S+ in https:\/\/github\.com\/\S+\/pull\/(\d+)$/

const mergedPullRequests = async () => {
  const base = { tag_name: tag, target_commitish: sha }
  const request =
    previousTag === null ? base : { ...base, previous_tag_name: previousTag }
  const { body } = decodeGeneratedNotes(
    await github("/releases/generate-notes", {
      method: "POST",
      body: JSON.stringify(request)
    })
  )
  return body.split("\n").flatMap((line) => {
    const match = PR_LINE.exec(line.trim())
    return match ? [{ title: match[1], number: Number(match[2]) }] : []
  })
}

const pullsByCommit = new Map<string, Promise<number | null>>()

const pullOfCommit = (commit: string) => {
  const cached = pullsByCommit.get(commit)
  if (cached !== undefined) return cached
  const pull = github(`/commits/${commit}/pulls`).then(
    (pulls) => decodeCommitPulls(pulls).at(0)?.number ?? null
  )
  pullsByCommit.set(commit, pull)
  return pull
}

const pullRequestOf = async (path: string) => {
  const commit = commitAdding(path, sha)
  if (commit === null) return null
  return prFromSubject(commit.subject) ?? pullOfCommit(commit.sha)
}

const releaseFilesSince = (since: string | null) =>
  readReleaseFiles(changesetsAddedSince(since, sha), pullRequestOf)

const checkFiles = async (
  files: ReadonlyArray<ReleaseFile>,
  asHotfix: boolean
) =>
  checkRelease({
    files,
    videos: await videoProblems(
      parsedFiles(files).flatMap(({ changeset }) =>
        changeset.video === null ? [] : [changeset.video]
      )
    ),
    hotfix: asHotfix
  })

const noEntries: Changelog = { entries: [] }

const previousChangelog = async () => {
  if (previousTag === null) return noEntries
  const release = decodeRelease(await github(`/releases/tags/${previousTag}`))
  const asset = release.assets.find(
    (candidate) => candidate.name === "changelog.json"
  )
  if (asset === undefined) return noEntries
  const response = await fetch(asset.url, {
    headers: {
      authorization: `Bearer ${env("GH_TOKEN")}`,
      accept: "application/octet-stream"
    }
  })
  if (!response.ok)
    throw new Error(
      `GitHub GET ${previousTag}'s changelog.json: ${response.status} ${await response.text()}`
    )
  try {
    return decodeChangelog(await response.text())
  } catch {
    console.log(
      `::warning::${previousTag}'s changelog.json is in an older format; starting a new one.`
    )
    return noEntries
  }
}

const bundleVideos = async (changelog: Changelog) => {
  await mkdir(`${OUT_DIR}/changelog-media`, { recursive: true })
  const copied = (file: string) =>
    copyFile(`${MEDIA_DIR}/${file}`, `${OUT_DIR}/changelog-media/${file}`).then(
      () => true,
      () => false
    )
  // A video ships only with both of its themes.
  const present = async (video: string | null) =>
    video !== null &&
    (await Promise.all(videoFiles(video).map(copied))).every(Boolean)
  const entries = await Promise.all(
    changelog.entries.map(async (entry) => ({
      ...entry,
      highlights: await Promise.all(
        entry.highlights.map(async (highlight) => ({
          ...highlight,
          video: (await present(highlight.video)) ? highlight.video : null
        }))
      )
    }))
  )
  return { entries } satisfies Changelog
}

const annotate = (problems: ReadonlyArray<Problem>) => {
  for (const problem of problems)
    console.log(
      `::${problem.level}${problem.file === null ? "" : ` file=${problem.file}`}::${problem.message}`
    )
}

const summarize = async (markdown: string) => {
  const summary = env("GITHUB_STEP_SUMMARY")
  if (summary !== "") await appendFile(summary, `${markdown}\n`)
}

const releases = async () => {
  const found = []
  for (let page = 1; page <= 20; page += 1) {
    const batch = decodeReleases(
      await github(`/releases?per_page=100&page=${page}`)
    )
    found.push(...batch)
    if (batch.length < 100) break
  }
  return found
}

// Creates the draft the first time, then edits it in place.
const updateDraft = async (body: string) => {
  const draft = (await releases()).find(
    (release) => release.draft && release.name === DRAFT_NAME
  )
  const fields = JSON.stringify({
    name: DRAFT_NAME,
    tag_name: DRAFT_TAG,
    target_commitish: sha,
    body: body.slice(0, MAX_RELEASE_BODY),
    draft: true
  })
  await (draft === undefined
    ? github("/releases", { method: "POST", body: fields })
    : github(`/releases/${draft.id}`, { method: "PATCH", body: fields }))
}

const nextStableDraft = async () => {
  const stableTag = lastStableTag(sha)
  const files = await releaseFilesSince(stableTag)
  const problems = await checkFiles(files, false)
  const entry = buildEntry({
    version: "Next stable",
    channel: "stable",
    date: new Date().toISOString(),
    url: "",
    changesets: parsedFiles(files)
  })
  const notes = releaseMarkdown(entry, {
    repo,
    sha,
    previousTag: stableTag,
    tag: sha
  })
  return [
    `> Kept up to date by the nightly workflow (${tag}): the notes the next stable would publish if it shipped \`${sha.slice(0, 7)}\` now, and the release check. The stable workflow writes its own release; don't publish this draft.`,
    "## Release check",
    checkMarkdown(problems),
    notes
  ].join("\n\n")
}

const stableEntry = async () => {
  const files = await releaseFilesSince(previousTag)
  const problems = await checkFiles(files, hotfix)
  console.log(checkReport(problems))
  annotate(problems)
  await summarize(checkMarkdown(problems))
  if (hasErrors(problems)) {
    console.log(
      '::error::The release notes are not ready. Fix the changesets (see .changeset/README.md, "Before a stable release") and run this workflow again.'
    )
    process.exit(1)
  }
  return buildEntry({
    version: tag,
    channel,
    date: new Date().toISOString(),
    url: `https://github.com/${repo}/releases/tag/${tag}`,
    changesets: parsedFiles(files)
  })
}

const nightlyEntry = async () => {
  const files = await releaseFilesSince(previousTag)
  for (const { file, parsed } of files)
    if (!parsed.ok) console.log(`::warning file=${file}::${parsed.problem}`)
  return buildEntry({
    version: tag,
    channel,
    date: new Date().toISOString(),
    url: `https://github.com/${repo}/releases/tag/${tag}`,
    changesets: parsedFiles(files),
    pullRequests: await mergedPullRequests()
  })
}

const entry = channel === "stable" ? await stableEntry() : await nightlyEntry()
const previous = await previousChangelog()
const changelog = await bundleVideos({
  entries: [entry, ...previous.entries].slice(0, KEEP_ENTRIES)
})
const notes = releaseMarkdown(entry, {
  repo,
  sha,
  previousTag,
  tag
})

await writeFile(`${OUT_DIR}/changelog.json`, JSON.stringify(changelog))
await writeFile(`${OUT_DIR}/notes.md`, notes)
console.log(notes)

if (channel === "nightly")
  try {
    const draft = await nextStableDraft()
    await updateDraft(draft)
    await summarize(draft)
    console.log(`Updated the "${DRAFT_NAME}" release.`)
  } catch (cause) {
    console.log(
      `::warning::Could not update the "${DRAFT_NAME}" release: ${String(cause)}`
    )
  }
