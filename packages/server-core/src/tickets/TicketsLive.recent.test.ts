import { ActivityActor, TicketStatus, UserId } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { testUser } from "../access/testing"
import type { TicketIndexTouchedEvent } from "./TicketIndex"
import { recentActivityOf } from "./TicketsLive"

const at = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))
const earlier = at("2026-03-01T00:00:00.000Z")
const later = at("2026-03-05T00:00:00.000Z")
const latest = at("2026-03-09T00:00:00.000Z")
const viewer = Schema.decodeUnknownSync(UserId)("viewer")
const status = Schema.decodeUnknownSync(TicketStatus)
const wouter = testUser("wouter")
const users = new Map([[wouter.id, wouter]])

const touched = (
  createdBy: string,
  lastCommentAt: Date | null,
  events: Readonly<{
    assignedEvent?: TicketIndexTouchedEvent
    statusEvent?: TicketIndexTouchedEvent
  }> = {}
): Parameters<typeof recentActivityOf>[0] => ({
  lastCommentAt,
  assignedEvent: events.assignedEvent ?? null,
  statusEvent: events.statusEvent ?? null,
  entry: { createdBy, createdAt: earlier }
})

const assignedBy = (
  actor: TicketIndexTouchedEvent["actor"],
  occurredAt: Date
): TicketIndexTouchedEvent => ({
  occurredAt,
  actor,
  change: { kind: "assignees_changed", added: [viewer], removed: [] }
})

const movedToDone = (
  actor: TicketIndexTouchedEvent["actor"],
  occurredAt: Date
): TicketIndexTouchedEvent => ({
  occurredAt,
  actor,
  change: {
    kind: "status_changed",
    from: status("in_progress"),
    to: status("done")
  }
})

describe("recentActivityOf", () => {
  it("prefers the viewer's latest comment when it is newer than creating", () => {
    expect(recentActivityOf(touched("viewer", later), viewer, users)).toEqual({
      tag: "commented",
      actor: viewer,
      at: later
    })
  })

  it("reports creating when the viewer never commented", () => {
    expect(recentActivityOf(touched("viewer", null), viewer, users)).toEqual({
      tag: "created",
      actor: viewer,
      at: earlier
    })
  })

  it("falls back to an assignment with no known actor or time", () => {
    expect(
      recentActivityOf(touched("someone-else", null), viewer, users)
    ).toEqual({ tag: "assigned" })
  })

  it("names who assigned the viewer and when", () => {
    expect(
      recentActivityOf(
        touched("viewer", null, {
          assignedEvent: assignedBy(ActivityActor.user(wouter.id), later)
        }),
        viewer,
        users
      )
    ).toEqual({
      tag: "assigned",
      actor: { kind: "user", user: wouter },
      at: later
    })
  })

  it("reports a status change newer than the viewer's own activity", () => {
    expect(
      recentActivityOf(
        touched("viewer", later, {
          assignedEvent: assignedBy(
            ActivityActor.system("automation"),
            earlier
          ),
          statusEvent: movedToDone(
            ActivityActor.agent(wouter.id, { id: "c-1", name: "Claude" }),
            latest
          )
        }),
        viewer,
        users
      )
    ).toEqual({
      tag: "status_changed",
      actor: {
        kind: "agent",
        user: wouter,
        client: { id: "c-1", name: "Claude" }
      },
      at: latest,
      from: "in_progress",
      to: "done"
    })
  })

  it("keeps the assignment time when its actor no longer resolves", () => {
    expect(
      recentActivityOf(
        touched("someone-else", null, {
          assignedEvent: assignedBy(ActivityActor.user("gone"), later)
        }),
        viewer,
        users
      )
    ).toEqual({ tag: "assigned", at: later })
  })
})
