import type { ChangelogEntry, ChangelogItem } from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  groupByArea,
  indexIds,
  indexItems,
  releaseCounts,
  releaseFromHash,
  repositoryUrl
} from "./releaseView"

const item = (text: string, area: ChangelogItem["area"] = "tickets") =>
  ({ text, area, prs: [1] }) satisfies ChangelogItem

const entry = (overrides: Partial<ChangelogEntry> = {}) =>
  ({
    version: "v2026.11.24",
    channel: "stable",
    date: "2026-11-24T09:00:00.000Z",
    url: "https://github.com/acme/pp/releases/tag/v2026.11.24",
    highlights: [],
    notices: [],
    sections: [],
    ...overrides
  }) satisfies ChangelogEntry

const labels = {
  highlights: "Highlights",
  notices: "Before you update",
  sections: { features: "New", improvements: "Improved", fixes: "Fixed" },
  earlier: "Earlier releases"
}

describe("groupByArea", () => {
  it("runs lines by area in the changelog's area order, keeping line order", () => {
    const runs = groupByArea([
      item("sidebar", "navigation"),
      item("first ticket"),
      item("sprint", "sprints"),
      item("second ticket")
    ])
    expect(runs.map((run) => run.area)).toEqual([
      "tickets",
      "sprints",
      "navigation"
    ])
    expect(runs[0]?.items.map((line) => line.text)).toEqual([
      "first ticket",
      "second ticket"
    ])
  })

  it("puts lines without an area last", () => {
    const runs = groupByArea([item("from a PR title", null), item("x")])
    expect(runs.map((run) => run.area)).toEqual(["tickets", null])
  })
})

describe("releaseCounts", () => {
  it("counts each kind across sections, without highlights or notices", () => {
    const counts = releaseCounts(
      entry({
        highlights: [
          {
            text: "h",
            body: "",
            area: "lists",
            where: null,
            video: null,
            prs: []
          }
        ],
        sections: [
          { kind: "features", items: [item("a"), item("b")] },
          { kind: "fixes", items: [item("c")] },
          { kind: "features", items: [item("d")] }
        ]
      })
    )
    expect(counts).toEqual({
      highlights: 1,
      notices: 0,
      features: 3,
      improvements: 0,
      fixes: 1,
      changes: 4
    })
  })
})

describe("indexItems", () => {
  it("lists the headings the release has, with highlights nested", () => {
    const items = indexItems(
      entry({
        highlights: [
          {
            text: "Select many",
            body: "",
            area: "lists",
            where: null,
            video: null,
            prs: []
          }
        ],
        notices: [{ text: "Upgrade nginx", body: "Now.", prs: [] }],
        sections: [{ kind: "fixes", items: [item("a"), item("b")] }]
      }),
      labels,
      true
    )
    expect(items.map((entry) => [entry.label, entry.count])).toEqual([
      ["Highlights", null],
      ["Fixed", 2],
      ["Before you update", null],
      ["Earlier releases", null]
    ])
    expect(indexIds(items)).toEqual([
      "highlights",
      "highlight-1",
      "fixed",
      "before-you-update",
      "earlier-releases"
    ])
  })

  it("leaves out earlier releases when there are none", () => {
    expect(indexItems(entry(), labels, false)).toEqual([])
  })
})

describe("releaseFromHash", () => {
  it("reads a release's version from its anchor", () => {
    expect(releaseFromHash("#release-v2026.11.10")).toBe("v2026.11.10")
    expect(releaseFromHash("#fixed")).toBeNull()
  })
})

describe("repositoryUrl", () => {
  it("reads the repository off a GitHub release URL", () => {
    expect(repositoryUrl("https://github.com/acme/pp/releases/tag/v1")).toBe(
      "https://github.com/acme/pp"
    )
    expect(repositoryUrl("https://example.test/v1")).toBeNull()
  })
})
