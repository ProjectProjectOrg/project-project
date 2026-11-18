import type { ReferenceToFix } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { groupReferences, withoutFixed } from "./referenceGroups"

const reference = (
  overrides: Partial<ReferenceToFix> & Pick<ReferenceToFix, "ticketId">
) =>
  ({
    kind: "user",
    target: "u-old",
    label: "@jan",
    snippet: "ask @jan",
    ...overrides
  }) satisfies ReferenceToFix

describe("groupReferences", () => {
  it("groups occurrences by kind and target, then by ticket, in first-seen order, showing a repeated snippet once", () => {
    const groups = groupReferences([
      reference({ ticketId: "PP-1", snippet: "first" }),
      reference({ ticketId: "PP-2", kind: "ticket", target: "OLD-9" }),
      reference({ ticketId: "PP-1", snippet: "second" }),
      reference({ ticketId: "PP-3", snippet: "third" }),
      reference({ ticketId: "PP-3", snippet: "third" })
    ])

    expect(groups).toEqual([
      {
        kind: "user",
        target: "u-old",
        label: "@jan",
        count: 4,
        tickets: [
          { ticketId: "PP-1", snippets: ["first", "second"] },
          { ticketId: "PP-3", snippets: ["third"] }
        ]
      },
      {
        kind: "ticket",
        target: "OLD-9",
        label: "@jan",
        count: 1,
        tickets: [{ ticketId: "PP-2", snippets: ["ask @jan"] }]
      }
    ])
  })

  it("keeps the same target under different kinds apart", () => {
    const groups = groupReferences([
      reference({ ticketId: "PP-1", kind: "ticket", target: "X" }),
      reference({ ticketId: "PP-1", kind: "link", target: "X" })
    ])

    expect(groups.map((group) => group.kind)).toEqual(["ticket", "link"])
  })
})

describe("withoutFixed", () => {
  const items = [
    reference({ ticketId: "PP-1" }),
    reference({ ticketId: "PP-2" }),
    reference({ ticketId: "PP-2", target: "u-other" })
  ]

  it("drops every occurrence of the target when no ticket is given", () => {
    expect(
      withoutFixed(
        { items },
        {
          kind: "user",
          target: "u-old",
          ticketId: null,
          action: { kind: "plain" }
        }
      ).items
    ).toEqual([items[2]])
  })

  it("drops only the given ticket's occurrences when a ticket is given", () => {
    expect(
      withoutFixed(
        { items },
        {
          kind: "user",
          target: "u-old",
          ticketId: "PP-2",
          action: { kind: "link", to: "u-new" }
        }
      ).items
    ).toEqual([items[0], items[2]])
  })
})
