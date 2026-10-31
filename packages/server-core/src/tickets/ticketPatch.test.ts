import { TagName, TicketId, TicketStatus } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import type { TicketDocument } from "./TicketDocs"
import {
  applyTicketPatch,
  hierarchyChangeOf,
  batchChangeOf,
  breaksEpicSprintRule,
  openSprintIdsOf,
  ticketChangeOf,
  type TicketPatch
} from "./ticketPatch"

const ticketId = Schema.decodeUnknownSync(TicketId)
const ticketStatus = Schema.decodeUnknownSync(TicketStatus)
const tagName = Schema.decodeUnknownSync(TagName)
const isoDate = (s: string) => DateTime.toDate(DateTime.makeUnsafe(s))
const created = isoDate("2026-04-01T00:00:00.000Z")
const now = isoDate("2026-04-02T00:00:00.000Z")

const existing: TicketDocument = {
  id: ticketId("T-2"),
  title: "Checkout",
  status: ticketStatus("todo"),
  type: "feat",
  priority: "med",
  estimate: { unit: "points", value: 3 },
  tags: [tagName("core")],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  assignees: ["user-1"],
  parent: ticketId("T-1"),
  archivedAt: null,
  createdBy: "user-1",
  createdAt: created,
  updatedBy: "user-1",
  updatedAt: created,
  body: "Body",
  commentsRegion: ""
}

describe("applyTicketPatch", () => {
  it("keeps every field the patch leaves out and stamps the editor", () => {
    expect(applyTicketPatch(existing, {}, "user-2", now)).toEqual({
      ...existing,
      updatedBy: "user-2",
      updatedAt: now
    })
  })

  it("sets the fields the patch names", () => {
    const next = applyTicketPatch(
      existing,
      {
        title: "Pay",
        status: ticketStatus("done"),
        type: "bug",
        priority: "high",
        estimate: { unit: "points", value: 5 },
        tags: [],
        assignees: ["user-2"],
        parent: ticketId("T-9"),
        body: "New"
      },
      "user-2",
      now
    )
    expect(next).toMatchObject({
      title: "Pay",
      status: "done",
      type: "bug",
      priority: "high",
      estimate: { unit: "points", value: 5 },
      tags: [],
      assignees: ["user-2"],
      parent: "T-9",
      body: "New"
    })
  })

  it("clears the estimate and parent when the patch sets them to null", () => {
    const next = applyTicketPatch(
      existing,
      { estimate: null, parent: null },
      "user-2",
      now
    )
    expect(next.estimate).toBeUndefined()
    expect(next.parent).toBeUndefined()
  })
})

describe("ticketChangeOf", () => {
  const cases: ReadonlyArray<
    readonly [string, TicketPatch, ReturnType<typeof ticketChangeOf>]
  > = [
    [
      "no change counts as a content edit",
      {},
      { content: true, status: false, assignees: false }
    ],
    [
      "a field set to its current value is no change",
      { title: "Checkout", status: ticketStatus("todo") },
      { content: true, status: false, assignees: false }
    ],
    [
      "a status change alone",
      { status: ticketStatus("done") },
      { content: false, status: true, assignees: false }
    ],
    [
      "an assignee change alone",
      { assignees: ["user-2"] },
      { content: false, status: false, assignees: true }
    ],
    [
      "an added assignee",
      { assignees: ["user-1", "user-2"] },
      { content: false, status: false, assignees: true }
    ],
    [
      "a status change with an equal estimate",
      { status: ticketStatus("done"), estimate: { unit: "points", value: 3 } },
      { content: false, status: true, assignees: false }
    ],
    [
      "a cleared estimate",
      { status: ticketStatus("done"), estimate: null },
      { content: true, status: true, assignees: false }
    ],
    [
      "a cleared parent",
      { assignees: [], parent: null },
      { content: true, status: false, assignees: true }
    ],
    [
      "a body edit",
      { status: ticketStatus("done"), body: "New" },
      { content: true, status: true, assignees: false }
    ],
    [
      "a tag edit",
      { status: ticketStatus("done"), tags: [tagName("core"), tagName("ui")] },
      { content: true, status: true, assignees: false }
    ]
  ]

  it.each(cases)("%s", (_name, patch, change) => {
    expect(
      ticketChangeOf(existing, applyTicketPatch(existing, patch, "u", now))
    ).toEqual(change)
  })
})

describe("batchChangeOf", () => {
  const none = { content: false, status: false, assignees: false }
  const cases: ReadonlyArray<
    readonly [
      string,
      ReadonlyArray<ReturnType<typeof batchChangeOf>>,
      ReturnType<typeof batchChangeOf>
    ]
  > = [
    [
      "a batch where nothing changes counts as a content edit",
      [none, none],
      { content: true, status: false, assignees: false }
    ],
    [
      "unchanged tickets add nothing to the tickets that change",
      [none, { ...none, status: true }],
      { content: false, status: true, assignees: false }
    ],
    [
      "each kind of change across the batch is required",
      [
        { ...none, status: true },
        { ...none, assignees: true },
        { ...none, content: true }
      ],
      { content: true, status: true, assignees: true }
    ]
  ]

  it.each(cases)("%s", (_name, changes, change) => {
    expect(batchChangeOf(changes)).toEqual(change)
  })
})

describe("breaksEpicSprintRule", () => {
  const ticket = existing
  const epic = { ...existing, type: "epic" as const }
  const cases: ReadonlyArray<
    readonly [
      string,
      TicketDocument,
      TicketDocument,
      ReadonlyArray<string>,
      ReadonlyArray<string>,
      boolean
    ]
  > = [
    [
      "becoming an epic while staying in a sprint",
      ticket,
      epic,
      ["G-1"],
      ["G-1"],
      true
    ],
    [
      "becoming an epic while leaving the sprint",
      ticket,
      epic,
      ["G-1"],
      [],
      false
    ],
    ["becoming an epic outside any sprint", ticket, epic, [], [], false],
    ["an epic planned into a sprint", epic, epic, [], ["G-1"], true],
    ["an epic moved to another sprint", epic, epic, ["G-1"], ["G-2"], true],
    [
      "an epic left in the sprint it is already in",
      epic,
      epic,
      ["G-1"],
      ["G-1"],
      false
    ],
    [
      "a ticket that isn't an epic planned into a sprint",
      ticket,
      ticket,
      [],
      ["G-1"],
      false
    ]
  ]

  it.each(cases)(
    "%s",
    (_name, before, after, sprintsBefore, sprintsAfter, breaks) => {
      expect(
        breaksEpicSprintRule(before, after, sprintsBefore, sprintsAfter)
      ).toBe(breaks)
    }
  )
})

const group = (
  id: string,
  kind: string,
  completedAt: Date | null,
  tickets: ReadonlyArray<string>
) => ({ id, kind, completedAt, tickets })

describe("openSprintIdsOf", () => {
  it("lists only open sprints that hold the ticket", () => {
    expect(
      openSprintIdsOf(
        [
          group("G-1", "sprint", null, ["T-2"]),
          group("G-2", "sprint", created, ["T-2"]),
          group("G-3", "epic", null, ["T-2"]),
          group("G-4", "sprint", null, ["T-3"])
        ],
        "T-2"
      )
    ).toEqual(["G-1"])
  })
})

describe("hierarchyChangeOf", () => {
  it("reports the new type and parent and whether the parent moved", () => {
    expect(
      hierarchyChangeOf(
        existing,
        applyTicketPatch(existing, { type: "epic", parent: null }, "u", now)
      )
    ).toEqual({
      id: "T-2",
      fromType: "feat",
      type: "epic",
      parent: undefined,
      parentChanged: true
    })
  })

  it("reports an unchanged parent", () => {
    expect(hierarchyChangeOf(existing, existing)).toMatchObject({
      parent: "T-1",
      parentChanged: false
    })
  })
})
