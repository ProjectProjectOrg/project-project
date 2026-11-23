import { describe, expect, it } from "vitest"

import { placeJiraStatuses } from "./PublicationPlan"

describe("placeJiraStatuses", () => {
  it("places each created status in the phase of its Jira category", () => {
    const placed = placeJiraStatuses([
      { slug: "backlog", icon: "CircleDashed" },
      { slug: "in_review", icon: "CircleDot" },
      { slug: "released", icon: "CircleCheck" },
      { slug: "testing", icon: "CircleDot" }
    ])
    expect(
      Object.fromEntries(placed.map(({ slug, phase }) => [slug, phase]))
    ).toEqual({
      backlog: "unstarted",
      in_review: "started",
      released: "finished",
      testing: "started"
    })
    const review = placed.find((s) => s.slug === "in_review")!.orderKey
    const testing = placed.find((s) => s.slug === "testing")!.orderKey
    expect(review < testing).toBe(true)
  })
})
