import { describe, expect, it } from "vitest"

import { markdownUserIds } from "./exportPeople"

describe("markdownUserIds", () => {
  it("collects frontmatter people and user mentions, not ticket mentions", () => {
    const content = [
      "---",
      "id: T-1",
      "createdBy: u_creator",
      "updatedBy: u_editor",
      "assignees: [u_a, u_b]",
      "---",
      "",
      "Ask [Ada](mention:user/u_ada) about [T-2](mention:ticket/T-2)."
    ].join("\n")

    expect(markdownUserIds(content)).toEqual([
      "u_creator",
      "u_editor",
      "u_a",
      "u_b",
      "u_ada"
    ])
  })
})
