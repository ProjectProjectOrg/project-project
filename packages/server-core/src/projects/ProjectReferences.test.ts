import { describe, expect, it } from "@effect/vitest"
import { ActivityActor, FixReferenceAction, ProjectScope } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { databaseLayer } from "../../test/database"
import { projectScope } from "../access/testing"
import {
  entryFromDocument,
  makeTicketDocument,
  ticketId
} from "../tickets/testing"
import * as TicketCommands from "../tickets/TicketCommands"
import * as TicketDocs from "../tickets/TicketDocs"
import * as TicketIndex from "../tickets/TicketIndex"
import * as Users from "../users/Users"
import * as ProjectReferences from "./ProjectReferences"

const bodies = new Map([
  [
    "PP-1",
    "[Bob](mention:user/old-bob) [Ada](mention:user/ada) [T-2](mention:ticket/T-2) [T-9](mention:ticket/T-9)"
  ],
  ["PP-2", "Again [Bob](mention:user/old-bob)."]
])
const updates: Array<Readonly<{ id: string; body: string }>> = []

const layer = ProjectReferences.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      databaseLayer(() => Effect.succeed([])),
      Layer.mock(TicketDocs.TicketDocs, {
        listIds: () =>
          Effect.succeed([...bodies.keys()].map((id) => ticketId(id))),
        read: (_org, _slug, id) =>
          Effect.succeed(makeTicketDocument(id, { body: bodies.get(id) ?? "" }))
      }),
      Layer.mock(TicketIndex.TicketIndex, {
        mentionableIds: () => Effect.succeed(new Set<string>()),
        existingIds: (_project, ids) =>
          Effect.succeed(new Set(ids.filter((id) => bodies.has(id))))
      }),
      Layer.mock(Users.Users, {
        findManyByIds: (ids) =>
          Effect.succeed(
            ids
              .filter((id) => id === "ada")
              .map((id) => ({
                id,
                email: `${id}@example.test`,
                name: id,
                username: null,
                image: null
              }))
          )
      }),
      Layer.mock(TicketCommands.TicketCommands, {
        update: (id, input) =>
          Effect.sync(() => {
            const body = input.body ?? ""
            updates.push({ id, body })
            bodies.set(id, body)
            return {
              ticket: {
                ...entryFromDocument(makeTicketDocument(id, { body })),
                sprint: null,
                parentState: null,
                relations: {
                  blockedBy: [],
                  blocking: [],
                  related: [],
                  duplicateOf: null,
                  duplicates: []
                },
                creator: null,
                updater: null,
                gitState: { tag: "no_branch" as const, baseBranch: "main" },
                stack: [],
                body
              },
              orderKey: null
            }
          })
      })
    )
  ),
  Layer.provideMerge(Layer.succeed(ProjectScope, projectScope("member", "pm"))),
  Layer.provideMerge(Layer.succeed(ActivityActor, ActivityActor.user("user-1")))
)

describe("ProjectReferences", () => {
  it.effect(
    "lists missing people and ticket links, including former keys that navigation cannot resolve",
    () =>
      Effect.gen(function* () {
        const references = yield* ProjectReferences.ProjectReferences
        const { items } = yield* references.list()
        expect(items.map((item) => [item.ticketId, item.target])).toEqual([
          ["PP-1", "old-bob"],
          ["PP-1", "T-2"],
          ["PP-1", "T-9"],
          ["PP-2", "old-bob"]
        ])
      }).pipe(Effect.provide(layer))
  )

  it.effect("fixes every occurrence at once", () =>
    Effect.gen(function* () {
      const references = yield* ProjectReferences.ProjectReferences
      const { items } = yield* references.fix({
        kind: "user",
        target: "old-bob",
        ticketId: null,
        action: FixReferenceAction.cases.plain.make({})
      })
      expect(updates.map((update) => update.id)).toEqual(["PP-1", "PP-2"])
      expect(bodies.get("PP-2")).toBe("Again Bob.")
      expect(items.map((item) => item.target)).toEqual(["T-2", "T-9"])
      expect(
        (yield* references.fix({
          kind: "ticket",
          target: "T-2",
          ticketId: null,
          action: FixReferenceAction.cases.link.make({ to: "PP-2" })
        })).items.map((item) => item.target)
      ).toEqual(["T-9"])
      expect(bodies.get("PP-1")).toContain("[T-2](mention:ticket/PP-2)")
      expect(
        (yield* references.fix({
          kind: "ticket",
          target: "T-9",
          ticketId: null,
          action: FixReferenceAction.cases.plain.make({})
        })).items
      ).toEqual([])
    }).pipe(Effect.provide(layer))
  )
})
