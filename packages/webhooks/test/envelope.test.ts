import { ProjectEvent } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { eventEnvelope, pingEnvelope } from "../src/envelope"

const at = (value: string | number) =>
  DateTime.toDate(DateTime.makeUnsafe(value))

const decode = Schema.decodeUnknownSync(ProjectEvent)
const context = {
  deliveryId: "evt_1",
  createdAt: at("2026-11-01T12:00:00Z"),
  orgSlug: "acme",
  projectSlug: "web",
  actor: { id: "user-1", name: "Ada" },
  baseUrl: "https://pp.example.com"
}

describe("eventEnvelope", () => {
  it("describes a status change with the ticket and its link", () => {
    const body = eventEnvelope(
      decode({
        kind: "ticket_status_changed",
        id: "T-12",
        title: "Ship it",
        status: "in_progress",
        type: "feat",
        previousStatus: "todo"
      }),
      context
    )
    expect(JSON.parse(body)).toEqual({
      id: "evt_1",
      type: "ticket_status_changed",
      createdAt: "2026-11-01T12:00:00.000Z",
      org: { slug: "acme" },
      project: {
        slug: "web",
        url: "https://pp.example.com/orgs/acme/projects/web"
      },
      actor: { id: "user-1", name: "Ada" },
      data: {
        ticket: {
          id: "T-12",
          title: "Ship it",
          status: "in_progress",
          type: "feat",
          url: "https://pp.example.com/orgs/acme/projects/web/tickets/T-12"
        },
        previousStatus: "todo"
      }
    })
  })

  it("reports a missing type on events recorded before types were captured", () => {
    const body = eventEnvelope(
      decode({
        kind: "ticket_created",
        id: "T-3",
        title: "Old",
        status: "todo"
      }),
      context
    )
    expect(JSON.parse(body).data.ticket.type).toBeNull()
  })

  it("describes assignee changes", () => {
    const body = eventEnvelope(
      decode({
        kind: "ticket_assignees_changed",
        id: "T-12",
        title: "Ship it",
        status: "todo",
        type: "bug",
        assignees: ["b"],
        added: ["b"],
        removed: ["a"]
      }),
      context
    )
    expect(JSON.parse(body).data).toMatchObject({
      assignees: ["b"],
      added: ["b"],
      removed: ["a"]
    })
  })

  it("describes sprints with their start", () => {
    const body = eventEnvelope(
      decode({
        kind: "sprint_started",
        id: "G-4",
        title: "Sprint 4",
        startsAt: "2026-11-02T09:00:00.000Z"
      }),
      { ...context, actor: null }
    )
    expect(JSON.parse(body)).toMatchObject({
      type: "sprint_started",
      actor: null,
      data: {
        sprint: {
          id: "G-4",
          title: "Sprint 4",
          startsAt: "2026-11-02T09:00:00.000Z",
          url: "https://pp.example.com/orgs/acme/projects/web/sprints/G-4"
        }
      }
    })
  })
})

describe("pingEnvelope", () => {
  it("sends an empty ping", () => {
    expect(JSON.parse(pingEnvelope(context))).toMatchObject({
      type: "ping",
      data: {}
    })
  })
})
