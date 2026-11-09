import { describe, expect, it } from "vitest"

import { scoreSearch, type Searchable } from "./searchScore"

const rank = (items: ReadonlyArray<Searchable>, query: string) =>
  items
    .flatMap((item) => {
      const score = scoreSearch(item, query)
      return score === null ? [] : [{ label: item.label, score }]
    })
    .toSorted((a, b) => b.score - a.score)
    .map(({ label }) => label)

describe("scoreSearch", () => {
  it.each([
    {
      query: "sprint",
      items: ["Move to sprint", "Create sprint", "Sprint settings"],
      first: "Sprint settings"
    },
    {
      query: "cs",
      items: ["Copy link", "Complete sprint", "Change status"],
      first: "Complete sprint"
    },
    {
      query: "art",
      items: ["Start sprint", "Archive ticket", "Artwork"],
      first: "Artwork"
    },
    {
      query: "crtspr",
      items: ["Create sprint", "Copy ticket ID"],
      first: "Create sprint"
    }
  ])("ranks $first first for '$query'", ({ query, items, first }) => {
    expect(
      rank(
        items.map((label) => ({ label })),
        query
      )[0]
    ).toBe(first)
  })

  it("ranks a visible label match above a hidden keyword match", () => {
    expect(
      rank(
        [
          { label: "Go to dashboard", keywords: ["my tickets"] },
          { label: "Find my tickets" }
        ],
        "tickets"
      )
    ).toEqual(["Find my tickets", "Go to dashboard"])
  })

  it.each([
    { label: "Archive ticket", query: "art" },
    { label: "Profile Account", query: "cont" }
  ])("drops loose letter match '$query' in '$label'", ({ label, query }) => {
    expect(scoreSearch({ label }, query)).toBeNull()
  })

  it("requires every word to match", () => {
    expect(scoreSearch({ label: "Create sprint" }, "create epic")).toBeNull()
  })
})
