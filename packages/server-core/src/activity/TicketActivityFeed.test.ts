import { it } from "@effect/vitest"
import {
  ActivityActor,
  decodeCursor,
  NotFound,
  ProjectScope,
  TICKET_ACTIVITY_PAGE_SIZE,
  TicketId,
  TicketStatus,
  UserId,
  type ProjectScopeShape
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { describe, expect } from "vitest"

import { projectScope, testUser } from "../access/testing"
import {
  TicketDocs,
  type TicketDocsShape,
  type TicketDocument
} from "../tickets/TicketDocs"
import { Users } from "../users/Users"
import { TicketActivity, type StoredTicketActivity } from "./TicketActivity"
import {
  TicketActivityFeed,
  TicketActivityFeedLive
} from "./TicketActivityFeed"

const ticketId = Schema.decodeUnknownSync(TicketId)
const status = Schema.decodeUnknownSync(TicketStatus)
const userId = Schema.decodeUnknownSync(UserId)
const at = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))

const unexpected = (method: string): Effect.Effect<never> =>
  Effect.die(new Error(`unexpected ${method} call`))

const ticket: TicketDocument = {
  id: ticketId("T-7"),
  title: "Split me",
  status: status("todo"),
  type: "feat",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  assignees: [],
  archivedAt: null,
  splitFrom: ticketId("T-3"),
  createdBy: "wouter",
  createdAt: at("2026-10-01T09:00:00Z"),
  updatedBy: "wouter",
  updatedAt: at("2026-10-01T09:00:00Z"),
  body: "",
  commentsRegion: ""
}

const stored = (
  seq: number,
  iso: string,
  change: StoredTicketActivity["change"],
  actor: StoredTicketActivity["actor"] = ActivityActor.user("wouter")
): StoredTicketActivity => ({
  id: `activity-${seq}`,
  seq,
  occurredAt: at(iso),
  actor,
  cause: null,
  change
})

const history: ReadonlyArray<StoredTicketActivity> = [
  stored(
    3,
    "2026-10-03T09:00:00Z",
    { kind: "pr_merged", number: 12 },
    ActivityActor.system("github")
  ),
  stored(
    2,
    "2026-10-02T09:00:00Z",
    { kind: "status_changed", from: status("todo"), to: status("in_progress") },
    ActivityActor.agent("luuk", { id: "client-1", name: "Claude" })
  ),
  stored(1, "2026-10-01T10:00:00Z", { kind: "description_edited" })
]

const gitRequests: Array<boolean> = []

const feedLayer = (
  scope: ProjectScopeShape,
  rows: ReadonlyArray<StoredTicketActivity>
) =>
  TicketActivityFeedLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(TicketActivity, {
          record: () => unexpected("TicketActivity.record"),
          recover: () => unexpected("TicketActivity.recover"),
          removeTicket: () => unexpected("TicketActivity.removeTicket"),
          page: (_projectId, _ticketId, _before, limit, includeGit) => {
            gitRequests.push(includeGit)
            return Effect.succeed(rows.slice(0, limit))
          }
        }),
        Layer.succeed(TicketDocs, {
          listIds: () => unexpected("TicketDocs.listIds"),
          read: (_orgSlug, _slug, id) =>
            id === ticket.id
              ? Effect.succeed(ticket)
              : Effect.fail(new NotFound()),
          create: () => unexpected("TicketDocs.create"),
          write: () => unexpected("TicketDocs.write"),
          update: () => unexpected("TicketDocs.update"),
          remove: () => unexpected("TicketDocs.remove"),
          readRaw: () => unexpected("TicketDocs.readRaw")
        } satisfies TicketDocsShape),
        Layer.succeed(Users, {
          findByEmail: () => unexpected("Users.findByEmail"),
          findManyByIds: () => unexpected("Users.findManyByIds"),
          fullByIds: (ids) => Effect.succeed(ids.map(testUser))
        })
      )
    ),
    Layer.merge(Layer.succeed(ProjectScope, scope))
  )

const list = (cursor?: string) =>
  Effect.flatMap(TicketActivityFeed, (feed) => feed.list("T-7", cursor))

describe("TicketActivityFeed", () => {
  it.effect("presents people, agents and GitHub, ending with creation", () =>
    Effect.gen(function* () {
      const page = yield* list()
      expect(page.nextCursor).toBeNull()
      expect(
        page.items.map((item) =>
          item.kind === "created"
            ? ["created", item.actor?.kind, item.splitFrom]
            : [item.change.kind, item.actor.kind]
        )
      ).toEqual([
        ["pr_merged", "system"],
        ["status_changed", "agent"],
        ["description_edited", "user"],
        ["created", "user", "T-3"]
      ])
      const agent = page.items[1]
      expect(agent.kind === "change" && agent.actor).toMatchObject({
        kind: "agent",
        user: { id: "luuk" },
        client: { name: "Claude" }
      })
    }).pipe(Effect.provide(feedLayer(projectScope("member", "pm"), history)))
  )

  it.effect("asks for git activity only when the viewer can read GitHub", () =>
    Effect.gen(function* () {
      gitRequests.length = 0
      yield* list().pipe(
        Effect.provide(feedLayer(projectScope("guest", "client"), history))
      )
      yield* list().pipe(
        Effect.provide(feedLayer(projectScope("member", "pm"), history))
      )
      expect(gitRequests).toEqual([false, true])
    })
  )

  it.effect("returns the people a change mentions, even ex-members", () =>
    Effect.gen(function* () {
      const page = yield* list()
      expect(page.people.map((person) => person.id)).toEqual(["gone-user"])
    }).pipe(
      Effect.provide(
        feedLayer(projectScope("member", "pm"), [
          stored(1, "2026-10-02T09:00:00Z", {
            kind: "assignees_changed",
            added: [],
            removed: [userId("gone-user")]
          })
        ])
      )
    )
  )

  it.effect(
    "pages with a cursor and only adds creation to the last page",
    () => {
      const many = Array.from(
        { length: TICKET_ACTIVITY_PAGE_SIZE + 1 },
        (_, i) =>
          stored(
            100 - i,
            `2026-10-02T09:${String(59 - (i % 60)).padStart(2, "0")}:00Z`,
            { kind: "title_changed", from: `t${i + 1}`, to: `t${i}` },
            ActivityActor.user(`user-${i}`)
          )
      )
      return Effect.gen(function* () {
        const page = yield* list()
        expect(page.items).toHaveLength(TICKET_ACTIVITY_PAGE_SIZE)
        expect(page.items.some((item) => item.kind === "created")).toBe(false)
        expect(page.nextCursor).not.toBeNull()
        expect(decodeCursor(page.nextCursor ?? "").id).toBe(
          String(many[TICKET_ACTIVITY_PAGE_SIZE - 1].seq)
        )
      }).pipe(Effect.provide(feedLayer(projectScope("member", "pm"), many)))
    }
  )

  it.effect("rejects a malformed cursor", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(list("not-a-cursor"))
      expect(error).toMatchObject({
        _tag: "Validation",
        reason: "invalid_cursor"
      })
    }).pipe(Effect.provide(feedLayer(projectScope("member", "pm"), history)))
  )
})
