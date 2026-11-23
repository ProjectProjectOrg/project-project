import { describe, expect, it } from "bun:test"

import { parseChangeset } from "./changesets"
import {
  buildEntry,
  checkRelease,
  hasErrors,
  type ReleaseFile,
  releaseMarkdown
} from "./releaseNotes"

const file = (
  name: string,
  pr: number | null,
  fields: ReadonlyArray<string>,
  line: string,
  body = ""
) =>
  ({
    file: name,
    pr,
    parsed: parseChangeset(["---", ...fields, "---", line, "", body].join("\n"))
  }) satisfies ReleaseFile

const highlight = (name: string, pr: number, rank: string, line: string) =>
  file(
    name,
    pr,
    [
      "kind: features",
      "area: lists",
      `highlight: ${rank}`,
      `video: ${name.replace(".md", "")}`
    ],
    line,
    "What it does."
  )

const changesetsOf = (files: ReadonlyArray<ReleaseFile>) =>
  files.flatMap(({ file: name, parsed, pr }) =>
    parsed.ok ? [{ file: name, changeset: parsed.changeset, pr }] : []
  )

const entryOf = (
  files: ReadonlyArray<ReleaseFile>,
  pullRequests?: ReadonlyArray<{ number: number; title: string }>
) =>
  buildEntry({
    version: "v2026.12.01",
    channel: "stable",
    date: "2026-12-01T12:00:00.000Z",
    url: "https://example.com",
    changesets: changesetsOf(files),
    pullRequests
  })

const check = (files: ReadonlyArray<ReleaseFile>, hotfix = false) =>
  checkRelease({ files, videos: new Map(), hotfix })

const messages = (files: ReadonlyArray<ReleaseFile>, hotfix = false) =>
  check(files, hotfix).map((problem) => problem.message)

const release = [
  highlight("select.md", 498, "2", "Select several tickets"),
  highlight("redesign.md", 565, "1", "A new look"),
  file(
    "types.md",
    513,
    ["kind: features", "area: tickets", "notice: true"],
    "Ticket types replace templates",
    "Scripts must switch."
  ),
  file("sprint.md", 528, ["kind: features", "area: sprints"], "Plan sprints"),
  file("rows.md", 507, ["kind: features", "area: tickets"], "Reorder rows"),
  file("dates.md", 478, ["kind: fixes", "area: sprints"], "Dates land right"),
  file(
    "caret.md",
    574,
    ["kind: internal", "follows: 507"],
    "Room below the caret"
  )
]

describe("buildEntry", () => {
  const entry = entryOf(release)

  it("orders highlights by rank and keeps them and notices out of the lists", () => {
    expect(entry.highlights.map((item) => item.text)).toEqual([
      "A new look",
      "Select several tickets"
    ])
    expect(entry.highlights[0]).toMatchObject({
      body: "What it does.",
      video: "redesign",
      prs: [565]
    })
    expect(entry.notices).toEqual([
      {
        text: "Ticket types replace templates",
        body: "Scripts must switch.",
        prs: [513]
      }
    ])
    expect(entry.sections.flatMap((section) => section.items)).toHaveLength(3)
  })

  it("groups lines by kind, sorts them by area and links follow-ups", () => {
    expect(entry.sections).toEqual([
      {
        kind: "features",
        items: [
          { text: "Reorder rows", area: "tickets", prs: [507, 574] },
          { text: "Plan sprints", area: "sprints", prs: [528] }
        ]
      },
      {
        kind: "fixes",
        items: [{ text: "Dates land right", area: "sprints", prs: [478] }]
      }
    ])
  })

  it("adds pull request titles only for pull requests no changeset covers", () => {
    const nightly = entryOf(release, [
      { number: 507, title: "feat: manual order" },
      { number: 574, title: "fix: caret room" },
      { number: 600, title: "fix(ci): faster builds" },
      { number: 601, title: "chore: bump deps" }
    ])
    expect(nightly.sections.at(-1)?.items.at(-1)).toEqual({
      text: "Faster builds",
      area: null,
      prs: [600]
    })
    expect(
      nightly.sections
        .flatMap((section) => section.items)
        .map((item) => item.text)
    ).not.toContain("Manual order")
  })
})

describe("releaseMarkdown", () => {
  it("writes highlights, notices and type headings with area subheadings", () => {
    const markdown = releaseMarkdown(entryOf(release), {
      repo: "org/repo",
      sha: "abc",
      previousTag: "v2026.11.11",
      tag: "v2026.12.01"
    })
    expect(markdown).toContain(
      "## Highlights\n\n### A new look\n\nWhat it does."
    )
    expect(markdown).toContain(
      "[light](https://github.com/org/repo/blob/abc/.changeset/media/redesign.light.mp4)"
    )
    expect(markdown).toContain("## Before you update\n\n### Ticket types")
    expect(markdown).toContain(
      "## New\n\n### Tickets\n\n- Reorder rows ([#507](https://github.com/org/repo/pull/507), [#574](https://github.com/org/repo/pull/574))\n\n### Sprints"
    )
    expect(markdown).toContain("compare/v2026.11.11...v2026.12.01")
  })
})

describe("checkRelease", () => {
  it("passes a release with ranked highlights and linked follow-ups", () => {
    expect(check(release)).toEqual([])
  })

  it("requires one to three highlights, except for a hotfix", () => {
    const plain = release.slice(2)
    expect(hasErrors(check(plain))).toBe(true)
    expect(hasErrors(check(plain, true))).toBe(false)
    const four = [
      ...release,
      highlight("a.md", 1, "3", "One"),
      highlight("b.md", 2, "true", "Two")
    ]
    expect(messages(four).join("\n")).toContain("4 highlights")
  })

  it("requires distinct ranks when there are several highlights", () => {
    const shared = [
      highlight("a.md", 1, "1", "One"),
      highlight("b.md", 2, "1", "Two")
    ]
    expect(messages(shared).join("\n")).toContain("rank 1 is taken by a.md")
    const unranked = [
      highlight("a.md", 1, "1", "One"),
      highlight("b.md", 2, "true", "Two")
    ]
    expect(check(unranked)).toMatchObject([{ file: "b.md", level: "error" }])
    expect(check([highlight("a.md", 1, "true", "One")])).toEqual([])
  })

  it("reports invalid files, video problems and repeated lines", () => {
    const problems = checkRelease({
      files: [
        ...release,
        file("bad.md", 1, ["kind: fixes"], "No area"),
        file("again.md", 2, ["kind: fixes", "area: lists"], "plan sprints")
      ],
      videos: new Map([["redesign", "redesign.dark.mp4 does not exist"]]),
      hotfix: false
    })
    expect(problems.map(({ file: name }) => name)).toEqual([
      "bad.md",
      "redesign.md",
      "again.md"
    ])
  })

  it("requires follows to point at a pull request with a line in this release", () => {
    const stray = file(
      "stray.md",
      700,
      ["kind: internal", "follows: 400"],
      "Fix a shipped thing"
    )
    expect(check([...release, stray])).toMatchObject([
      { file: "stray.md", level: "error" }
    ])
  })

  it("warns about a line with no pull request", () => {
    const orphan = file("orphan.md", null, ["kind: fixes", "area: lists"], "Hm")
    expect(check([...release, orphan])).toMatchObject([
      { file: "orphan.md", level: "warning" }
    ])
  })
})
