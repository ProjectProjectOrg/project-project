import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { UserId } from "../auth/User"
import { Group } from "../groups/Group"
import { StatusSlug } from "../statuses/Status"
import { TagName } from "../tags/Tag"
import type { Ticket } from "../tickets/Ticket"
import { TicketId } from "../tickets/Ticket"
import {
  matchesTicketFilter,
  matchesTicketQuery,
  type MatchableTicket
} from "./match"
import {
  TicketFilterRule,
  type TicketFilter,
  type TicketListQuery
} from "./Ticket"

const decodeTicketId = Schema.decodeUnknownSync(TicketId)
const decodeTagName = Schema.decodeUnknownSync(TagName)
const s = Schema.decodeUnknownSync(StatusSlug)
const userId = Schema.decodeUnknownSync(UserId)
const isoDate = (s: string) => DateTime.toDate(DateTime.makeUnsafe(s))

const baseTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: decodeTicketId("T-1"),
  title: "Test",
  status: s("todo"),
  type: "feat",
  priority: "med",
  estimate: null,
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch" },
  assignees: [],
  parent: null,
  archivedAt: null,
  createdBy: "user-1",
  createdAt: isoDate("2026-05-01T00:00:00.000Z"),
  updatedAt: isoDate("2026-05-10T00:00:00.000Z"),
  ...overrides
})

describe("matchesTicketFilter", () => {
  it("estimate filter only counts estimates in the project's current unit", () => {
    const points = baseTicket({ estimate: { unit: "points", value: 4 } })
    const stale = baseTicket({ estimate: { unit: "tshirt", value: "M" } })
    const none = baseTicket()
    const cases: ReadonlyArray<
      readonly [
        Extract<
          import("./Ticket").TicketFilterRule,
          Readonly<{ field: "estimate" }>
        >["values"],
        ReadonlyArray<boolean>
      ]
    > = [
      [["M"], [false, false, false]],
      [["any"], [true, false, false]],
      [["none"], [false, true, true]],
      [["stale"], [false, true, false]],
      [[], [false, false, false]]
    ]
    for (const [estimate, expected] of cases) {
      expect(
        [points, stale, none].map((t) =>
          matchesTicketFilter(
            t,
            {
              rules: [{ field: "estimate", operator: "is", values: estimate }]
            },
            undefined,
            "points"
          )
        )
      ).toEqual(expected)
    }
  })

  it("undefined filter matches everything", () => {
    expect(matchesTicketFilter(baseTicket(), undefined)).toBe(true)
  })

  it("empty filter object matches everything", () => {
    expect(matchesTicketFilter(baseTicket(), {})).toBe(true)
  })

  it("status filter ORs across entries", () => {
    const t = baseTicket({ status: s("in_progress") })
    const f: TicketFilter = {
      rules: [
        {
          field: "status",
          operator: "is",
          values: [s("in_progress"), s("done")]
        }
      ]
    }
    expect(matchesTicketFilter(t, f)).toBe(true)
    expect(matchesTicketFilter(baseTicket({ status: s("todo") }), f)).toBe(
      false
    )
  })

  it("empty status array matches nothing", () => {
    expect(
      matchesTicketFilter(baseTicket(), {
        rules: [{ field: "status", operator: "is", values: [] }]
      })
    ).toBe(false)
  })

  it("type filter ORs across entries", () => {
    const f: TicketFilter = {
      rules: [{ field: "type", operator: "is", values: ["bug"] }]
    }
    expect(matchesTicketFilter(baseTicket({ type: "bug" }), f)).toBe(true)
    expect(matchesTicketFilter(baseTicket({ type: "feat" }), f)).toBe(false)
  })

  it("assignee: unassigned entry matches unassigned tickets", () => {
    const t = baseTicket({ assignees: [] })
    expect(
      matchesTicketFilter(t, {
        rules: [{ field: "assignee", operator: "is", values: ["unassigned"] }]
      })
    ).toBe(true)
    expect(
      matchesTicketFilter(t, {
        rules: [
          { field: "assignee", operator: "is", values: [userId("alice")] }
        ]
      })
    ).toBe(false)
  })

  it("assignee mix matches union of unassigned + named", () => {
    const f: TicketFilter = {
      rules: [
        {
          field: "assignee",
          operator: "is",
          values: ["unassigned", userId("alice")]
        }
      ]
    }
    expect(matchesTicketFilter(baseTicket({ assignees: [] }), f)).toBe(true)
    expect(matchesTicketFilter(baseTicket({ assignees: ["alice"] }), f)).toBe(
      true
    )
    expect(matchesTicketFilter(baseTicket({ assignees: ["bob"] }), f)).toBe(
      false
    )
  })

  it("tags filter ORs across entries (any tag in common wins)", () => {
    const t = baseTicket({
      tags: [decodeTagName("bug"), decodeTagName("perf")]
    })
    expect(
      matchesTicketFilter(t, {
        rules: [
          { field: "tags", operator: "is", values: [decodeTagName("bug")] }
        ]
      })
    ).toBe(true)
    expect(
      matchesTicketFilter(t, {
        rules: [
          { field: "tags", operator: "is", values: [decodeTagName("ui")] }
        ]
      })
    ).toBe(false)
  })

  it("hasBranch true requires non-null branch", () => {
    expect(
      matchesTicketFilter(baseTicket({ branch: "feat/x" }), { hasBranch: true })
    ).toBe(true)
    expect(
      matchesTicketFilter(baseTicket({ branch: null }), { hasBranch: true })
    ).toBe(false)
  })

  it("hasBranch false requires null branch", () => {
    expect(
      matchesTicketFilter(baseTicket({ branch: null }), { hasBranch: false })
    ).toBe(true)
    expect(
      matchesTicketFilter(baseTicket({ branch: "feat/x" }), {
        hasBranch: false
      })
    ).toBe(false)
  })

  it("hasPr mirrors hasBranch against pr", () => {
    expect(matchesTicketFilter(baseTicket({ pr: 7 }), { hasPr: true })).toBe(
      true
    )
    expect(matchesTicketFilter(baseTicket({ pr: null }), { hasPr: true })).toBe(
      false
    )
  })

  it("updatedAfter is strict greater-than", () => {
    const t = baseTicket({ updatedAt: isoDate("2026-05-10T00:00:00.000Z") })
    expect(
      matchesTicketFilter(t, {
        updatedAfter: isoDate("2026-05-09T00:00:00.000Z")
      })
    ).toBe(true)
    expect(
      matchesTicketFilter(t, {
        updatedAfter: isoDate("2026-05-10T00:00:00.000Z")
      })
    ).toBe(false)
    expect(
      matchesTicketFilter(t, {
        updatedAfter: isoDate("2026-05-11T00:00:00.000Z")
      })
    ).toBe(false)
  })

  it("ANDs across fields", () => {
    const t = baseTicket({ status: s("in_progress"), type: "bug" })
    expect(
      matchesTicketFilter(t, {
        rules: [
          { field: "status", operator: "is", values: [s("in_progress")] },
          { field: "type", operator: "is", values: ["bug"] }
        ]
      })
    ).toBe(true)
    expect(
      matchesTicketFilter(t, {
        rules: [
          { field: "status", operator: "is", values: [s("in_progress")] },
          { field: "type", operator: "is", values: ["feat"] }
        ]
      })
    ).toBe(false)
  })
})

describe("matchesTicketQuery", () => {
  it("empty query matches everything", () => {
    expect(matchesTicketQuery(baseTicket(), {}, userId("user-a"), "off")).toBe(
      true
    )
  })

  it("hides archived tickets by default", () => {
    const archived = baseTicket({
      archivedAt: isoDate("2026-05-11T00:00:00.000Z")
    })
    expect(matchesTicketQuery(archived, {}, userId("user-a"), "off")).toBe(
      false
    )
    expect(matchesTicketQuery(baseTicket(), {}, userId("user-a"), "off")).toBe(
      true
    )
  })

  it("shows only archived tickets when archived filter is set", () => {
    const archived = baseTicket({
      archivedAt: isoDate("2026-05-11T00:00:00.000Z")
    })
    const active = baseTicket()
    expect(
      matchesTicketQuery(
        archived,
        { rules: [{ field: "archived", operator: "is" }] },
        userId("user-a"),
        "off"
      )
    ).toBe(true)
    expect(
      matchesTicketQuery(
        active,
        { rules: [{ field: "archived", operator: "is" }] },
        userId("user-a"),
        "off"
      )
    ).toBe(false)
  })

  it("q matches on title case-insensitively", () => {
    const t = baseTicket({ title: "Hello world" })
    expect(matchesTicketQuery(t, { q: "HELLO" }, userId("user-a"), "off")).toBe(
      true
    )
    expect(
      matchesTicketQuery(t, { q: "goodbye" }, userId("user-a"), "off")
    ).toBe(false)
  })

  it("q matches on id case-insensitively", () => {
    const t = baseTicket({ id: decodeTicketId("T-1"), title: "Something else" })
    expect(matchesTicketQuery(t, { q: "t-1" }, userId("user-a"), "off")).toBe(
      true
    )
  })

  it("'mine' resolves to viewer id in assignee filter", () => {
    const t = baseTicket({ assignees: ["user-a"] })
    expect(
      matchesTicketQuery(
        t,
        { rules: [{ field: "assignee", operator: "is", values: ["mine"] }] },
        userId("user-a"),
        "off"
      )
    ).toBe(true)
    expect(
      matchesTicketQuery(
        t,
        { rules: [{ field: "assignee", operator: "is", values: ["mine"] }] },
        userId("user-b"),
        "off"
      )
    ).toBe(false)
  })

  it("unassigned assignee selector matches tickets without assignees", () => {
    const unassigned = baseTicket({ assignees: [] })
    const assigned = baseTicket({ assignees: ["user-a"] })
    expect(
      matchesTicketQuery(
        unassigned,
        {
          rules: [{ field: "assignee", operator: "is", values: ["unassigned"] }]
        },
        userId("user-a"),
        "off"
      )
    ).toBe(true)
    expect(
      matchesTicketQuery(
        assigned,
        {
          rules: [{ field: "assignee", operator: "is", values: ["unassigned"] }]
        },
        userId("user-a"),
        "off"
      )
    ).toBe(false)
  })

  it("ANDs q and filter — both must match", () => {
    const ticket = baseTicket({ status: s("in_progress"), title: "hello" })
    const both: TicketFilter & Pick<TicketListQuery, "q"> = {
      q: "hello",
      rules: [{ field: "status", operator: "is", values: [s("in_progress")] }]
    }
    expect(matchesTicketQuery(ticket, both, userId("user-a"), "off")).toBe(true)

    expect(
      matchesTicketQuery(
        ticket,
        {
          q: "hello",
          rules: [{ field: "status", operator: "is", values: [s("todo")] }]
        },
        userId("user-a"),
        "off"
      )
    ).toBe(false)
    expect(
      matchesTicketQuery(
        ticket,
        {
          q: "goodbye",
          rules: [
            { field: "status", operator: "is", values: [s("in_progress")] }
          ]
        },
        userId("user-a"),
        "off"
      )
    ).toBe(false)
  })

  it("q does not match across title/id boundary", () => {
    const t = baseTicket({ id: decodeTicketId("T-1"), title: "Hello world" })
    expect(
      matchesTicketQuery(t, { q: "world T" }, userId("user-a"), "off")
    ).toBe(false)
    expect(
      matchesTicketQuery(t, { q: "world t" }, userId("user-a"), "off")
    ).toBe(false)
  })

  it("whitespace-only q is a no-op", () => {
    const t = baseTicket({ title: "Hello world" })
    expect(matchesTicketQuery(t, { q: "   " }, userId("user-a"), "off")).toBe(
      true
    )
    expect(matchesTicketQuery(t, { q: " " }, userId("user-a"), "off")).toBe(
      true
    )
  })

  it("accepts a MatchableTicket without ticket-only fields", () => {
    const predicted: MatchableTicket = {
      id: "",
      title: "new ticket",
      status: s("todo"),
      type: "feat",
      tags: [],
      branch: null,
      pr: null,
      prState: null,
      assignees: [],
      estimate: null,
      archivedAt: null,
      updatedAt: isoDate("2026-05-10T00:00:00.000Z")
    }
    expect(
      matchesTicketQuery(
        predicted,
        { rules: [{ field: "status", operator: "is", values: [s("todo")] }] },
        userId("user-a"),
        "off"
      )
    ).toBe(true)
    expect(
      matchesTicketQuery(
        predicted,
        { rules: [{ field: "status", operator: "is", values: [s("done")] }] },
        userId("user-a"),
        "off"
      )
    ).toBe(false)
    expect(
      matchesTicketQuery(predicted, { q: "anything" }, userId("user-a"), "off")
    ).toBe(false)
  })
})

it("negates scalar, set, unassigned, missing-estimate predicates", () => {
  const ticket = baseTicket()
  const rules: ReadonlyArray<
    Readonly<{ rule: TicketFilterRule; expected: boolean }>
  > = [
    {
      rule: { field: "status", operator: "isNot", values: [s("todo")] },
      expected: false
    },
    {
      rule: { field: "type", operator: "isNot", values: ["bug"] },
      expected: true
    },
    {
      rule: {
        field: "tags",
        operator: "isNot",
        values: [decodeTagName("bug")]
      },
      expected: true
    },
    {
      rule: { field: "assignee", operator: "isNot", values: ["unassigned"] },
      expected: false
    },
    {
      rule: { field: "estimate", operator: "isNot", values: ["any"] },
      expected: true
    },
    { rule: { field: "archived", operator: "isNot" }, expected: true }
  ]
  for (const { rule, expected } of rules)
    expect(
      matchesTicketQuery(ticket, { rules: [rule] }, undefined, "points")
    ).toBe(expected)
})

it("matches negated sprint membership from resolved groups and requires its context", () => {
  const sprint = Schema.decodeUnknownSync(Group)({
    id: "G-1",
    name: "Sprint",
    kind: "sprint",
    tickets: ["T-1"],
    color: "#777777",
    startsAt: null,
    endsAt: null,
    completedAt: null,
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  })
  const rule = Schema.decodeUnknownSync(TicketFilterRule)({
    field: "sprint",
    operator: "isNot",
    values: ["G-1"]
  })
  expect(
    matchesTicketQuery(baseTicket(), { rules: [rule] }, undefined, "off", [
      sprint
    ])
  ).toBe(false)
  expect(
    matchesTicketQuery(
      baseTicket({ id: decodeTicketId("T-2") }),
      { rules: [rule] },
      undefined,
      "off",
      [sprint]
    )
  ).toBe(true)
  expect(
    matchesTicketQuery(baseTicket(), { rules: [rule] }, undefined, "off")
  ).toBe(false)
})
