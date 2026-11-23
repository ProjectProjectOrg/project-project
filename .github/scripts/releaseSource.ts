import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"

import {
  CHANGESET_DIR,
  isChangesetPath,
  type ParsedChangeset,
  parseChangeset
} from "./changesets"
import type { ReleaseFile } from "./releaseNotes"

const STABLE_TAG = /^v\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/
const SQUASH_SUBJECT = /\(#(\d+)\)$/

export const git = (...args: ReadonlyArray<string>) =>
  execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .filter((line) => line !== "")

const isAncestor = (tag: string, ref: string) => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", tag, ref])
    return true
  } catch {
    return false
  }
}

// The newest stable tag `ref` contains, or null before the first stable.
export const lastStableTag = (ref: string) =>
  git("tag", "--list", "v*", "--sort=-v:refname")
    .filter((tag) => STABLE_TAG.test(tag))
    .find((tag) => isAncestor(tag, ref)) ?? null

// At `ref`, or in the working tree with untracked files when `ref` is null.
export const changesetsAddedSince = (
  tag: string | null,
  ref: string | null
) => {
  const paths =
    tag === null
      ? git("ls-tree", "-r", "--name-only", ref ?? "HEAD", CHANGESET_DIR)
      : git(
          "diff",
          "--name-only",
          // A new changeset that resembles a deleted one is still an addition.
          "--no-renames",
          "--diff-filter=A",
          tag,
          ...(ref === null ? [] : [ref]),
          "--",
          CHANGESET_DIR
        )
  const untracked =
    ref === null
      ? git("ls-files", "--others", "--exclude-standard", CHANGESET_DIR)
      : []
  return [...new Set([...paths, ...untracked])]
    .filter(isChangesetPath)
    .toSorted()
}

export const commitAdding = (path: string, ref: string) =>
  git("log", "--diff-filter=A", "--format=%H %s", "-1", ref, "--", path)
    .map((line) => ({
      sha: line.slice(0, line.indexOf(" ")),
      subject: line.slice(line.indexOf(" ") + 1)
    }))
    .at(0) ?? null

// A squash merge names its pull request at the end of the subject: "(#498)".
export const prFromSubject = (subject: string) => {
  const match = SQUASH_SUBJECT.exec(subject)
  return match === null ? null : Number(match[1])
}

export const readReleaseFiles = async (
  paths: ReadonlyArray<string>,
  prOf: (path: string, parsed: ParsedChangeset) => Promise<number | null>
) =>
  Promise.all(
    paths.map(async (path) => {
      const parsed = parseChangeset(await readFile(path, "utf8"))
      const own = parsed.ok ? parsed.changeset.pr : null
      return {
        file: path,
        parsed,
        pr: own ?? (await prOf(path, parsed))
      } satisfies ReleaseFile
    })
  )
