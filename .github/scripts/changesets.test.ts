import { describe, expect, it } from "bun:test"

import { isChangesetPath, parseChangeset } from "./changesets"

const changeset = (
  fields: ReadonlyArray<string>,
  line = "Drag tickets",
  body = ""
) => parseChangeset(["---", ...fields, "---", line, "", body].join("\n"))

const problemOf = (result: ReturnType<typeof changeset>) =>
  result.ok ? null : result.problem

const words = (count: number) =>
  Array.from({ length: count }, () => "word").join(" ")

const feature = ["kind: features", "area: lists"]

describe("parseChangeset", () => {
  it("requires an area on every line except internal ones", () => {
    expect(changeset(feature).ok).toBe(true)
    expect(changeset(["kind: fixes"]).ok).toBe(false)
    expect(changeset(["kind: fixes", "area: boards"]).ok).toBe(false)
    expect(changeset(["kind: internal"]).ok).toBe(true)
    expect(changeset(["kind: internal", "area: lists"]).ok).toBe(false)
  })

  it("reads a highlight's rank and requires its video and body", () => {
    const highlight = [...feature, "highlight: 2", "video: drag"]
    expect(changeset(highlight, "Drag tickets", "Pick one up.")).toMatchObject({
      ok: true,
      changeset: { highlight: true, rank: 2, video: "drag" }
    })
    expect(
      changeset([...feature, "highlight: true", "video: drag"], "Drag", "Body")
    ).toMatchObject({ ok: true, changeset: { highlight: true, rank: null } })
    expect(changeset(highlight).ok).toBe(false)
    expect(changeset([...feature, "highlight: 1"], "Drag", "Body").ok).toBe(
      false
    )
    expect(changeset([...feature, "highlight: 4", "video: drag"]).ok).toBe(
      false
    )
  })

  it("keeps videos, where and bodies to highlights and notices", () => {
    expect(changeset([...feature, "video: drag"]).ok).toBe(false)
    expect(changeset([...feature, "where: Backlog"]).ok).toBe(false)
    expect(changeset(feature, "Drag tickets", "A body").ok).toBe(false)
  })

  it("requires a body on a notice and keeps it apart from highlights", () => {
    expect(changeset([...feature, "notice: true"]).ok).toBe(false)
    expect(
      changeset([...feature, "notice: true"], "Types replace templates", "Do X")
        .ok
    ).toBe(true)
    expect(
      changeset(
        [...feature, "notice: true", "highlight: 1", "video: drag"],
        "Drag",
        "Body"
      ).ok
    ).toBe(false)
  })

  it("rejects unknown fields and names the ones that are gone", () => {
    expect(problemOf(changeset([...feature, "layuot: tile"]))).toContain(
      'unknown field "layuot"'
    )
    expect(problemOf(changeset([...feature, "layout: tile"]))).toContain(
      "layout is gone"
    )
    expect(problemOf(changeset([...feature, "value: 3x"]))).toContain(
      "value is gone"
    )
  })

  it("keeps the summary to 20 words, without a period or 'You can now'", () => {
    expect(changeset(feature, words(20)).ok).toBe(true)
    expect(changeset(feature, words(21)).ok).toBe(false)
    expect(changeset(feature, "Drag tickets.").ok).toBe(false)
    expect(changeset(feature, "You can now drag tickets").ok).toBe(false)
  })

  it("reads the pull requests a line belongs to and covers", () => {
    expect(changeset([...feature, "pr: 498", "prs: 466, #471"])).toMatchObject({
      ok: true,
      changeset: { pr: 498, prs: [466, 471] }
    })
    expect(changeset([...feature, "prs: soon"]).ok).toBe(false)
    expect(changeset([...feature, "pr: 1, 2"]).ok).toBe(false)
  })

  it("takes follows on an internal changeset only", () => {
    expect(changeset(["kind: internal", "follows: 466"])).toMatchObject({
      ok: true,
      changeset: { follows: 466 }
    })
    expect(changeset([...feature, "follows: 466"]).ok).toBe(false)
  })
})

describe("isChangesetPath", () => {
  it("takes the files directly in .changeset, not the folders under it", () => {
    expect(isChangesetPath(".changeset/drag-sprints.md")).toBe(true)
    expect(isChangesetPath(".changeset/README.md")).toBe(false)
    expect(isChangesetPath(".changeset/dryrun/REPORT.md")).toBe(false)
  })
})
