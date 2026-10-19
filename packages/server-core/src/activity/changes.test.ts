import {
  GroupId,
  TagName,
  TicketId,
  TicketStatus,
  type Estimate
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  groupMembershipChanges,
  ticketChanges,
  type GroupMembershipSource,
  type TicketChangeSource
} from "./changes"

const status = Schema.decodeUnknownSync(TicketStatus)
const tag = Schema.decodeUnknownSync(TagName)
const ticketId = Schema.decodeUnknownSync(TicketId)
const groupId = Schema.decodeUnknownSync(GroupId)

const base: TicketChangeSource = {
  title: "Add button",
  status: status("todo"),
  priority: "med",
  type: "feat",
  assignees: ["user-1"],
  tags: [tag("core")],
  body: "Body\n",
  archivedAt: null,
  branch: null,
  pr: null,
  prState: null
}

const archivedAt = DateTime.toDate(DateTime.makeUnsafe("2026-10-01T00:00:00Z"))

describe("ticketChanges", () => {
  it.each<Estimate>([
    { unit: "points", value: 5 },
    { unit: "tshirt", value: "M" },
    { unit: "time", minutes: 90 }
  ])("records adding and clearing a $unit estimate", (estimate) => {
    const estimated = { ...base, estimate }
    expect(ticketChanges(base, estimated)).toEqual([
      { kind: "estimate_changed", from: null, to: estimate }
    ])
    expect(ticketChanges(estimated, base)).toEqual([
      { kind: "estimate_changed", from: estimate, to: null }
    ])
    expect(
      ticketChanges(estimated, { ...base, estimate: { ...estimate } })
    ).toEqual([])
  })

  it("records estimate value and unit changes", () => {
    const first = { ...base, estimate: { unit: "points", value: 3 } as const }
    const second = { ...base, estimate: { unit: "points", value: 5 } as const }
    const third = { ...base, estimate: { unit: "time", minutes: 90 } as const }
    expect(ticketChanges(first, second)).toEqual([
      { kind: "estimate_changed", from: first.estimate, to: second.estimate }
    ])
    expect(ticketChanges(second, third)).toEqual([
      { kind: "estimate_changed", from: second.estimate, to: third.estimate }
    ])
  })

  it.each([
    ["nothing", {}, []],
    [
      "title",
      { title: "Add primary button" },
      [{ kind: "title_changed", from: "Add button", to: "Add primary button" }]
    ],
    [
      "status",
      { status: status("done") },
      [{ kind: "status_changed", from: "todo", to: "done" }]
    ],
    [
      "priority",
      { priority: "high" as const },
      [{ kind: "priority_changed", from: "med", to: "high" }]
    ],
    [
      "type",
      { type: "bug" as const },
      [{ kind: "type_changed", from: "feat", to: "bug" }]
    ],
    [
      "assignees added and removed in one write",
      { assignees: ["user-2", "user-3"] },
      [
        {
          kind: "assignees_changed",
          added: ["user-2", "user-3"],
          removed: ["user-1"]
        }
      ]
    ],
    ["assignees reordered", { assignees: ["user-1"] }, []],
    [
      "tags",
      { tags: [tag("core"), tag("auth")] },
      [{ kind: "tags_changed", added: ["auth"], removed: [] }]
    ],
    [
      "description",
      { body: "Body, edited\n" },
      [{ kind: "description_edited" }]
    ],
    ["archive", { archivedAt }, [{ kind: "archived" }]],
    [
      "branch linked",
      { branch: "feat/T-1-add-button" },
      [{ kind: "branch_linked", branch: "feat/T-1-add-button" }]
    ]
  ] as const)("records %s", (_name, patch, expected) => {
    expect(ticketChanges(base, { ...base, ...patch })).toEqual(expected)
  })

  it("records unarchive", () => {
    expect(ticketChanges({ ...base, archivedAt }, base)).toEqual([
      { kind: "unarchived" }
    ])
  })

  it("records a branch swap as unlinked then linked", () => {
    expect(
      ticketChanges(
        { ...base, branch: "feat/old" },
        { ...base, branch: "feat/new" }
      )
    ).toEqual([
      { kind: "branch_unlinked", branch: "feat/old" },
      { kind: "branch_linked", branch: "feat/new" }
    ])
  })

  it.each([
    [
      "opened",
      { pr: null, prState: null },
      { pr: 42, prState: "open" as const },
      [{ kind: "pr_opened", number: 42 }]
    ],
    [
      "merged",
      { pr: 42, prState: "open" as const },
      { pr: 42, prState: "merged" as const },
      [{ kind: "pr_merged", number: 42 }]
    ],
    [
      "closed",
      { pr: 42, prState: "open" as const },
      { pr: 42, prState: "closed" as const },
      [{ kind: "pr_closed", number: 42 }]
    ],
    [
      "reopened",
      { pr: 42, prState: "closed" as const },
      { pr: 42, prState: "open" as const },
      [{ kind: "pr_opened", number: 42 }]
    ],
    [
      "state first learned for a known open PR",
      { pr: 42, prState: null },
      { pr: 42, prState: "open" as const },
      []
    ],
    [
      "cleared",
      { pr: 42, prState: "merged" as const },
      { pr: null, prState: null },
      []
    ]
  ] as const)("pull request %s", (_name, before, after, expected) => {
    expect(
      ticketChanges({ ...base, ...before }, { ...base, ...after })
    ).toEqual(expected)
  })

  it("records a merge that also closes the ticket as both changes", () => {
    expect(
      ticketChanges(
        { ...base, pr: 7, prState: "open" },
        { ...base, pr: 7, prState: "merged", status: status("done") }
      )
    ).toEqual([
      { kind: "status_changed", from: "todo", to: "done" },
      { kind: "pr_merged", number: 7 }
    ])
  })
})

describe("ticketChanges for stacked branches", () => {
  const linked = {
    ...base,
    branch: "feat/T-1",
    pr: 41,
    prState: "open" as const
  }

  it("records a stacked branch arriving with its pull request", () => {
    expect(
      ticketChanges(linked, {
        ...linked,
        stack: [{ branch: "feat/T-1-ui", pr: 42, prState: "open" }]
      })
    ).toEqual([
      { kind: "stack_branch_added", branch: "feat/T-1-ui" },
      { kind: "pr_opened", number: 42 }
    ])
  })

  it("records a stacked pull request's merge and the branch leaving", () => {
    const stacked = {
      ...linked,
      stack: [
        { branch: "feat/T-1-ui", pr: 42, prState: "open" as const },
        { branch: "feat/T-1-docs" }
      ]
    }
    expect(
      ticketChanges(stacked, {
        ...linked,
        stack: [{ branch: "feat/T-1-ui", pr: 42, prState: "merged" }]
      })
    ).toEqual([
      { kind: "stack_branch_removed", branch: "feat/T-1-docs" },
      { kind: "pr_merged", number: 42 }
    ])
  })

  it("ignores a stack that only changed order or base", () => {
    expect(
      ticketChanges(
        {
          ...linked,
          stack: [{ branch: "a" }, { branch: "b", base: "feat/T-1" }]
        },
        { ...linked, stack: [{ branch: "b", base: "a" }, { branch: "a" }] }
      )
    ).toEqual([])
  })
})

describe("groupMembershipChanges", () => {
  const sprint: GroupMembershipSource = {
    id: groupId("G-1"),
    kind: "sprint",
    name: "Sprint 4",
    tickets: [ticketId("T-1"), ticketId("T-2")]
  }
  const subject = { groupId: "G-1", groupKind: "sprint", name: "Sprint 4" }

  it("records each ticket that joins or leaves", () => {
    expect(
      groupMembershipChanges(sprint, {
        ...sprint,
        tickets: [ticketId("T-2"), ticketId("T-3")]
      })
    ).toEqual([
      { ticketId: "T-1", change: { kind: "group_removed", ...subject } },
      { ticketId: "T-3", change: { kind: "group_added", ...subject } }
    ])
  })

  it("treats a new group as adding its tickets", () => {
    expect(groupMembershipChanges(null, sprint)).toEqual([
      { ticketId: "T-1", change: { kind: "group_added", ...subject } },
      { ticketId: "T-2", change: { kind: "group_added", ...subject } }
    ])
  })

  it("treats a deleted group as removing its tickets", () => {
    expect(groupMembershipChanges(sprint, null)).toEqual([
      { ticketId: "T-1", change: { kind: "group_removed", ...subject } },
      { ticketId: "T-2", change: { kind: "group_removed", ...subject } }
    ])
  })

  it("ignores reordering and renames", () => {
    expect(
      groupMembershipChanges(sprint, {
        ...sprint,
        name: "Sprint 4b",
        tickets: [ticketId("T-2"), ticketId("T-1")]
      })
    ).toEqual([])
  })
})
