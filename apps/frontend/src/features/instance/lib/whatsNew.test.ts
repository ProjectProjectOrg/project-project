import type { ChangelogEntry } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { hasUnseen, previewLines, topVideo, whatsNew } from "./whatsNew"

const entry = (version: string, overrides: Partial<ChangelogEntry> = {}) =>
  ({
    version,
    channel: "nightly",
    date: "2026-11-20T10:00:00.000Z",
    url: `https://example.test/${version}`,
    highlights: [],
    notices: [],
    sections: [
      {
        kind: "fixes",
        items: [{ text: `Fix in ${version}`, area: "tickets", prs: [1] }]
      }
    ],
    ...overrides
  }) satisfies ChangelogEntry

const entries = [entry("v3"), entry("v2"), entry("v1")]

describe("whatsNew", () => {
  it("is empty once the newest version has been seen", () => {
    expect(whatsNew(entries, "v3")).toBeNull()
  })

  it("collects every release since the one last seen", () => {
    const notes = whatsNew(entries, "v1")
    expect(notes?.version).toBe("v3")
    expect(notes?.sections).toEqual([
      {
        kind: "fixes",
        items: [
          { text: "Fix in v3", area: "tickets", prs: [1] },
          { text: "Fix in v2", area: "tickets", prs: [1] }
        ]
      }
    ])
  })

  it("shows only the newest release when nothing or something unknown was seen", () => {
    expect(whatsNew(entries, null)?.sections[0]?.items).toHaveLength(1)
    expect(whatsNew(entries, "v0")?.sections[0]?.items).toHaveLength(1)
  })

  it("orders sections as new, improved, fixed", () => {
    expect(
      whatsNew(
        [
          entry("v3", {
            sections: [
              { kind: "fixes", items: [{ text: "b", area: null, prs: [2] }] }
            ]
          }),
          entry("v2", {
            sections: [
              { kind: "features", items: [{ text: "a", area: null, prs: [1] }] }
            ]
          }),
          entry("v1")
        ],
        "v1"
      )?.sections.map((section) => section.kind)
    ).toEqual(["features", "fixes"])
  })
})

describe("previewLines", () => {
  it("prefers the highlights a stable release was written with", () => {
    const notes = whatsNew(
      [
        entry("v1", {
          highlights: [
            {
              text: "Big thing",
              body: "",
              area: null,
              where: null,
              video: null,
              prs: [1]
            },
            {
              text: "Shown",
              body: "Why it matters",
              area: "lists",
              where: "Sidebar",
              video: "shown",
              prs: [2]
            }
          ]
        })
      ],
      null
    )
    expect(notes && previewLines(notes)).toEqual(["Big thing", "Shown"])
    expect(notes && topVideo(notes)).toBe("shown")
  })
})

describe("hasUnseen", () => {
  it("is true until the newest release has been seen", () => {
    expect(hasUnseen(entries, null)).toBe(true)
    expect(hasUnseen(entries, "v2")).toBe(true)
    expect(hasUnseen(entries, "v3")).toBe(false)
  })

  it("is false without releases", () => {
    expect(hasUnseen([], null)).toBe(false)
  })
})
