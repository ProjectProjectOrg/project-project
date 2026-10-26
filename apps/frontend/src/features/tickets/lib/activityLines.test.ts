import {
  TicketActivityChange,
  TicketId,
  type ActivityCause,
  type TicketActivityChangeEncoded
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { m } from "@/paraglide/messages"

import type { ActivityItem } from "./activityGroups"
import { activityLines } from "./activityLines"

const decodeChange = Schema.decodeUnknownSync(TicketActivityChange)
const ticketId = Schema.decodeUnknownSync(TicketId)
const at = DateTime.toDate(DateTime.makeUnsafe("2026-10-16T12:00:00Z"))

const changeItem = (
  change: TicketActivityChangeEncoded,
  cause: ActivityCause | null = null
): ActivityItem => ({
  kind: "entry",
  key: "a",
  entry: {
    kind: "change",
    id: "a",
    occurredAt: at,
    actor: { kind: "system", source: "automation" },
    cause,
    change: decodeChange(change)
  }
})

const lines = (change: TicketActivityChangeEncoded) =>
  activityLines(changeItem(change))

describe("activityLines", () => {
  it("describes a created ticket", () => {
    expect(
      activityLines({
        kind: "entry",
        key: "created",
        entry: {
          kind: "created",
          id: "created",
          occurredAt: at,
          actor: null,
          splitFrom: null
        }
      })
    ).toEqual([
      {
        body: { kind: "plain", text: m.tickets_activity_created() },
        cause: null
      }
    ])
  })

  it("names the ticket a created ticket was split from", () => {
    expect(
      activityLines({
        kind: "entry",
        key: "created",
        entry: {
          kind: "created",
          id: "created",
          occurredAt: at,
          actor: null,
          splitFrom: ticketId("PP-4")
        }
      })
    ).toEqual([
      {
        body: {
          kind: "verb",
          verb: m.tickets_activity_split_from(),
          value: { kind: "literal", text: "PP-4", icon: null }
        },
        cause: null
      }
    ])
  })

  it("shows the new title", () => {
    expect(lines({ kind: "title_changed", from: "Old", to: "New" })).toEqual([
      {
        body: {
          kind: "verb",
          verb: m.tickets_activity_title_changed(),
          value: { kind: "text", text: "New" }
        },
        cause: null
      }
    ])
  })

  it("shows status, priority and type as from-to fields", () => {
    expect(
      lines({ kind: "status_changed", from: "todo", to: "done" })[0]?.body
    ).toEqual({
      kind: "field",
      label: m.tickets_activity_field_status(),
      from: { kind: "status", slug: "todo" },
      to: { kind: "status", slug: "done" }
    })
    expect(
      lines({ kind: "priority_changed", from: "low", to: "high" })[0]?.body
    ).toEqual({
      kind: "field",
      label: m.tickets_activity_field_priority(),
      from: { kind: "priority", priority: "low" },
      to: { kind: "priority", priority: "high" }
    })
    expect(
      lines({ kind: "type_changed", from: "chore", to: "bug" })[0]?.body
    ).toEqual({
      kind: "field",
      label: m.tickets_activity_field_type(),
      from: { kind: "type", type: "chore" },
      to: { kind: "type", type: "bug" }
    })
  })

  it("formats estimates and shows a missing one as none", () => {
    expect(
      lines({
        kind: "estimate_changed",
        from: null,
        to: { unit: "points", value: 3 }
      })[0]?.body
    ).toEqual({
      kind: "field",
      label: m.tickets_activity_field_estimate(),
      from: { kind: "text", text: m.tickets_filters_estimate_none() },
      to: { kind: "text", text: m.tickets_estimate_points({ count: 3 }) }
    })
  })

  it("gives added and removed assignees a line each, skipping empty sides", () => {
    expect(
      lines({ kind: "assignees_changed", added: ["u1", "u2"], removed: ["u3"] })
    ).toEqual([
      {
        body: {
          kind: "verb",
          verb: m.tickets_activity_assignees_added(),
          value: { kind: "people", ids: ["u1", "u2"] }
        },
        cause: null
      },
      {
        body: {
          kind: "verb",
          verb: m.tickets_activity_assignees_removed(),
          value: { kind: "people", ids: ["u3"] }
        },
        cause: null
      }
    ])
    expect(
      lines({ kind: "assignees_changed", added: [], removed: ["u3"] })
    ).toHaveLength(1)
  })

  it("gives added and removed tags a line each, skipping empty sides", () => {
    expect(lines({ kind: "tags_changed", added: ["ui"], removed: [] })).toEqual(
      [
        {
          body: {
            kind: "verb",
            verb: m.tickets_activity_tags_added(),
            value: { kind: "tags", names: ["ui"] }
          },
          cause: null
        }
      ]
    )
    expect(
      lines({ kind: "tags_changed", added: [], removed: ["ui"] })[0]?.body
    ).toEqual({
      kind: "verb",
      verb: m.tickets_activity_tags_removed(),
      value: { kind: "tags", names: ["ui"] }
    })
  })

  it("describes description edits and unarchiving in plain text", () => {
    expect(lines({ kind: "description_edited" })[0]?.body).toEqual({
      kind: "plain",
      text: m.tickets_activity_description_edited()
    })
    expect(lines({ kind: "unarchived" })[0]?.body).toEqual({
      kind: "plain",
      text: m.tickets_activity_unarchived()
    })
  })

  it("quotes an archive reason when there is one", () => {
    expect(lines({ kind: "archived" })[0]?.body).toEqual({
      kind: "plain",
      text: m.tickets_activity_archived()
    })
    expect(lines({ kind: "archived", reason: "Duplicate" })[0]?.body).toEqual({
      kind: "quoted",
      text: m.tickets_activity_archived(),
      quote: "Duplicate"
    })
  })

  it("lists the tickets a split produced", () => {
    expect(lines({ kind: "split", into: ["PP-5", "PP-6"] })[0]?.body).toEqual({
      kind: "verb",
      verb: m.tickets_activity_split(),
      value: { kind: "literal", text: "PP-5, PP-6", icon: null }
    })
  })

  it("names the group a ticket joined or left", () => {
    const group = {
      groupId: "G-1",
      groupKind: "epic",
      name: "Launch"
    } as const
    expect(lines({ kind: "group_added", ...group })[0]?.body).toEqual({
      kind: "verb",
      verb: m.tickets_activity_group_added(),
      value: { kind: "group", groupKind: "epic", name: "Launch" }
    })
    expect(lines({ kind: "group_removed", ...group })[0]?.body).toEqual({
      kind: "verb",
      verb: m.tickets_activity_group_removed(),
      value: { kind: "group", groupKind: "epic", name: "Launch" }
    })
  })

  it("shows branches and pull requests with their git icon", () => {
    const cases = [
      [
        { kind: "branch_linked", branch: "feat/a" },
        m.tickets_activity_branch_linked(),
        "feat/a",
        "branch"
      ],
      [
        { kind: "branch_unlinked", branch: "feat/a" },
        m.tickets_activity_branch_unlinked(),
        "feat/a",
        "branch"
      ],
      [
        { kind: "stack_branch_added", branch: "feat/b" },
        m.tickets_activity_stack_branch_added(),
        "feat/b",
        "stack"
      ],
      [
        { kind: "stack_branch_removed", branch: "feat/b" },
        m.tickets_activity_stack_branch_removed(),
        "feat/b",
        "stack"
      ],
      [
        { kind: "pr_opened", number: 12 },
        m.tickets_activity_pr_opened(),
        "#12",
        "pr_opened"
      ],
      [
        { kind: "pr_merged", number: 12 },
        m.tickets_activity_pr_merged(),
        "#12",
        "pr_merged"
      ],
      [
        { kind: "pr_closed", number: 12 },
        m.tickets_activity_pr_closed(),
        "#12",
        "pr_closed"
      ]
    ] as const
    for (const [change, verb, text, icon] of cases) {
      expect(lines(change)[0]?.body).toEqual({
        kind: "verb",
        verb,
        value: { kind: "literal", text, icon }
      })
    }
  })

  it("appends the cause to every line of a caused change", () => {
    expect(
      activityLines(
        changeItem(
          { kind: "assignees_changed", added: ["u1"], removed: ["u2"] },
          "member_removed"
        )
      ).map((line) => line.cause)
    ).toEqual([
      m.tickets_activity_cause_member_removed(),
      m.tickets_activity_cause_member_removed()
    ])
  })

  it("shows a sprint move as one sprint field with its cause", () => {
    expect(
      activityLines({
        kind: "sprint_moved",
        key: "a:b",
        from: "Sprint 1",
        to: "Sprint 2",
        cause: "sprint_completed"
      })
    ).toEqual([
      {
        body: {
          kind: "field",
          label: m.tickets_activity_field_sprint(),
          from: { kind: "group", groupKind: "sprint", name: "Sprint 1" },
          to: { kind: "group", groupKind: "sprint", name: "Sprint 2" }
        },
        cause: m.tickets_activity_cause_sprint_completed()
      }
    ])
  })
})
