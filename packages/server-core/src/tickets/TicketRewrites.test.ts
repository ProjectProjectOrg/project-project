import { it } from "@effect/vitest"
import { ActivityActor } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { describe, expect } from "vitest"

import { FinishedStatuses } from "../projects/FinishedStatuses"
import {
  FakeDb,
  isoDate,
  makeFakeTicketDocs,
  makeFakeTicketIndex,
  makeTicketDocument,
  ticketStatus,
  userId
} from "./testing"
import * as TicketDocs from "./TicketDocs"
import * as TicketDocumentLock from "./ticketDocumentLock"
import * as TicketRewrites from "./TicketRewrites"

const removed = userId("user-gone")
const kept = userId("user-kept")
const before = isoDate("2026-04-01T00:00:00.000Z")

const fixture = (malformed: ReadonlyArray<string> = []) => {
  const docs = makeFakeTicketDocs([])
  for (const document of [
    makeTicketDocument("T-1", { assignees: [removed, kept] }),
    makeTicketDocument("T-2", {
      assignees: [removed],
      status: ticketStatus("done")
    }),
    makeTicketDocument("T-3", { assignees: [kept] }),
    makeTicketDocument("T-4", { assignees: [removed] }),
    makeTicketDocument("T-5", { assignees: [removed] })
  ]) {
    docs.documents.set(document.id, document)
  }
  const activity: Array<{
    id: string
    options: TicketDocs.TicketActivityOptions
  }> = []
  const upserts: Array<string> = []
  const index = new Map(docs.documents)
  const ticketDocs = Layer.succeed(TicketDocs.TicketDocs, {
    ...docs.service,
    listIds: () =>
      docs.service
        .listIds("org", "p")
        .pipe(Effect.map((ids) => [...ids, ...malformed.map(ticketIdOf)])),
    update: (org, slug, id, transform, onPersist, options = {}) =>
      malformed.includes(id)
        ? Effect.fail(
            new TicketDocs.MalformedTicketDocument({
              orgSlug: org,
              slug,
              ticketId: id,
              path: `${id}.md`,
              reason: "frontmatter",
              cause: null
            })
          )
        : docs.service
            .update(org, slug, id, transform, onPersist, options)
            .pipe(
              Effect.tap(() =>
                Effect.sync(() => activity.push({ id, options }))
              )
            )
  })
  const layer = TicketRewrites.layer.pipe(
    Layer.provide(ticketDocs),
    Layer.provide(
      makeFakeTicketIndex(index, {
        upsertTicket: (_project, document) =>
          Effect.sync(() => upserts.push(document.id))
      })
    ),
    Layer.provide(FinishedStatuses.baseline),
    Layer.provide(TicketDocumentLock.layer),
    Layer.provide(FakeDb)
  )
  return { documents: docs.documents, activity, upserts, layer }
}

const ticketIdOf = (id: string) => makeTicketDocument(id).id

const unassign = (
  layer: Layer.Layer<TicketRewrites.TicketRewrites>
): Effect.Effect<void, never, never> =>
  Effect.flatMap(TicketRewrites.TicketRewrites, (rewrites) =>
    rewrites.unassignUserFromActiveTickets("org", "p", removed)
  ).pipe(
    Effect.provideService(ActivityActor, ActivityActor.user("user-pm")),
    Effect.provide(layer)
  )

describe("unassigning a removed member from a project's tickets", () => {
  it.effect("takes them off unfinished tickets and leaves the rest", () =>
    Effect.gen(function* () {
      const { documents, activity, upserts, layer } = fixture()
      yield* unassign(layer)

      expect(documents.get("T-1")?.assignees).toEqual([kept])
      expect(documents.get("T-1")?.updatedAt).not.toEqual(before)
      expect(documents.get("T-2")?.assignees).toEqual([removed])
      expect(documents.get("T-2")?.updatedAt).toEqual(before)
      expect(documents.get("T-3")?.updatedAt).toEqual(before)
      expect(documents.get("T-4")?.assignees).toEqual([])
      expect(upserts).toEqual(expect.arrayContaining(["T-1", "T-4", "T-5"]))
      expect(
        activity.every(({ options }) => options.cause === "member_removed")
      ).toBe(true)
    })
  )

  it.effect("skips a malformed ticket and still unassigns the others", () =>
    Effect.gen(function* () {
      const { documents, layer } = fixture(["T-9"])
      yield* unassign(layer)

      expect(documents.get("T-4")?.assignees).toEqual([])
      expect(documents.get("T-5")?.assignees).toEqual([])
    })
  )
})
