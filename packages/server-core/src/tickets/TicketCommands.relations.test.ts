import { it } from "@effect/vitest"
import { ActivityActor, ProjectScope } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import { expect } from "vitest"

import {
  entryFromDocument,
  makeFakeTicketDocs,
  makeFakeTicketIndex,
  makeTicketDocument,
  makeTicketsFixture,
  makeTicketsLayer,
  ticketId
} from "./testing"
import * as TicketCommands from "./TicketCommands"

const archivedOn = DateTime.toDate(DateTime.makeUnsafe("2026-04-02T00:00:00Z"))

const fixture = () => makeTicketsFixture("T", ["T-1", "T-2", "T-3", "T-4"])

const run = <A, E>(
  layer: ReturnType<typeof fixture>["layer"],
  body: (
    commands: TicketCommands.TicketCommands["Service"]
  ) => Effect.Effect<A, E, ProjectScope | ActivityActor>
) =>
  Effect.flatMap(TicketCommands.TicketCommands, body).pipe(
    Effect.provide(layer)
  )

const ids = (list: ReadonlyArray<{ readonly id: string }>) =>
  list.map((ticket) => ticket.id)

it.effect("marking blocked by stores the link on the waiting ticket", () => {
  const { documents, layer } = fixture()
  return run(layer, (commands) =>
    Effect.gen(function* () {
      const detail = yield* commands.mark("T-1", {
        kind: "blockedBy",
        target: ticketId("T-2")
      })
      expect(ids(detail.relations.blockedBy)).toEqual(["T-2"])
      expect(documents.get("T-1")?.blockedBy).toEqual(["T-2"])
      expect(documents.get("T-2")?.blockedBy).toBeUndefined()
    })
  )
})

it.effect(
  "marking blocking writes the other ticket and reads back both ways",
  () => {
    const { documents, layer } = fixture()
    return run(layer, (commands) =>
      Effect.gen(function* () {
        const detail = yield* commands.mark("T-1", {
          kind: "blocking",
          target: ticketId("T-2")
        })
        expect(ids(detail.relations.blocking)).toEqual(["T-2"])
        expect(documents.get("T-2")?.blockedBy).toEqual(["T-1"])
        expect(documents.get("T-1")?.blockedBy).toBeUndefined()
      })
    )
  }
)

it.effect(
  "a blocker that would close a loop is rejected with the chain",
  () => {
    const { documents, layer } = fixture()
    documents.set(
      "T-2",
      makeTicketDocument("T-2", { blockedBy: [ticketId("T-3")] })
    )
    documents.set(
      "T-3",
      makeTicketDocument("T-3", { blockedBy: [ticketId("T-1")] })
    )
    return run(layer, (commands) =>
      Effect.gen(function* () {
        const failure = yield* commands
          .mark("T-1", { kind: "blockedBy", target: ticketId("T-2") })
          .pipe(Effect.flip)
        expect(failure).toMatchObject({
          _tag: "Validation",
          reason: "blocking_cycle:T-1,T-2,T-3,T-1"
        })
        expect(documents.get("T-1")?.blockedBy).toBeUndefined()
      })
    )
  }
)

it.effect("an archived link still counts towards a loop", () => {
  const { documents, layer } = fixture()
  documents.set(
    "T-2",
    makeTicketDocument("T-2", {
      blockedBy: [ticketId("T-1")],
      archivedAt: archivedOn
    })
  )
  return run(layer, (commands) =>
    commands.update("T-1", { blockedBy: [ticketId("T-2")] }).pipe(
      Effect.flip,
      Effect.map((failure) =>
        expect(failure).toMatchObject({
          reason: "blocking_cycle:T-1,T-2,T-1"
        })
      )
    )
  )
})

it.effect(
  "related reads once from either side and unlinking clears both files",
  () => {
    const { documents, layer } = fixture()
    documents.set(
      "T-2",
      makeTicketDocument("T-2", { relatedTo: [ticketId("T-1")] })
    )
    return run(layer, (commands) =>
      Effect.gen(function* () {
        const linked = yield* commands.mark("T-1", {
          kind: "related",
          target: ticketId("T-2")
        })
        expect(ids(linked.relations.related)).toEqual(["T-2"])
        expect(documents.get("T-1")?.relatedTo).toBeUndefined()

        const unlinked = yield* commands.unmark("T-1", {
          kind: "related",
          target: ticketId("T-2")
        })
        expect(unlinked.relations.related).toEqual([])
        expect(documents.get("T-2")?.relatedTo).toBeUndefined()
      })
    )
  }
)

it.effect("relations on update must name tickets in the project", () => {
  const { layer } = fixture()
  return run(layer, (commands) =>
    commands
      .update("T-1", { blockedBy: [ticketId("T-9")], relatedTo: [] })
      .pipe(
        Effect.flip,
        Effect.map((failure) =>
          expect(failure).toMatchObject({ reason: "unknown_tickets:T-9" })
        )
      )
  )
})

it.effect("editing relations drops links to tickets whose file is gone", () => {
  const { documents, layer } = fixture()
  documents.set(
    "T-1",
    makeTicketDocument("T-1", { blockedBy: [ticketId("T-9")] })
  )
  return run(layer, (commands) =>
    Effect.gen(function* () {
      yield* commands.mark("T-1", {
        kind: "related",
        target: ticketId("T-2")
      })
      expect(documents.get("T-1")?.blockedBy).toBeUndefined()
      expect(documents.get("T-1")?.relatedTo).toEqual(["T-2"])
    })
  )
})

it.effect(
  "archiving as a duplicate links and archives in one write, and restore clears it",
  () => {
    const { documents, layer } = fixture()
    return run(layer, (commands) =>
      Effect.gen(function* () {
        const archived = yield* commands.archive("T-1", {
          duplicateOf: ticketId("T-2")
        })
        expect(archived.archivedAt).not.toBeNull()
        expect(archived.relations.duplicateOf?.id).toBe("T-2")
        expect(documents.get("T-1")?.duplicateOf).toBe("T-2")

        const restored = yield* commands.unarchive("T-1")
        expect(restored.relations.duplicateOf).toBeNull()
        expect(documents.get("T-1")?.duplicateOf).toBeUndefined()
      })
    )
  }
)

it.effect("duplicate chains are rejected from both ends", () => {
  const { documents, layer } = fixture()
  documents.set(
    "T-2",
    makeTicketDocument("T-2", {
      duplicateOf: ticketId("T-3"),
      archivedAt: archivedOn
    })
  )
  return run(layer, (commands) =>
    Effect.gen(function* () {
      const ontoDuplicate = yield* commands
        .archive("T-1", { duplicateOf: ticketId("T-2") })
        .pipe(Effect.flip)
      expect(ontoDuplicate).toMatchObject({
        reason: "duplicate_of_duplicate:T-2,T-3"
      })
      const originalBecomesDuplicate = yield* commands
        .archive("T-3", { duplicateOf: ticketId("T-4") })
        .pipe(Effect.flip)
      expect(originalBecomesDuplicate).toMatchObject({
        reason: "has_duplicates:T-2"
      })
      expect(documents.get("T-1")?.archivedAt).toBeNull()
    })
  )
})

it.effect("an update returns the ticket's relation counts", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  const counts = {
    openBlockerCount: 1,
    openBlockingCount: 2,
    relatedCount: 3,
    duplicateCount: 4
  }
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(docs.documents, {
      list: () =>
        Effect.sync(() =>
          [...docs.documents.values()].map((document) => ({
            ...entryFromDocument(document),
            ...counts
          }))
        )
    })
  })
  return run(layer, (commands) =>
    commands
      .update("T-1", { priority: "high" })
      .pipe(Effect.map(({ ticket }) => expect(ticket).toMatchObject(counts)))
  )
})
