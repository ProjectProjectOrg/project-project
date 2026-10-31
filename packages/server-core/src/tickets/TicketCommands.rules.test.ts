import { it } from "@effect/vitest"
import { SprintCompletedImmutable } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { expect } from "vitest"

import { projectScope } from "../access/testing"
import { type GroupsShape } from "../groups/Groups"
import { ProjectDocs } from "../projects/ProjectDocs"
import {
  decodeGroupSync,
  decodeGroupDetailSync,
  isoDate,
  ticketId,
  ticketStatus,
  unexpected,
  makeTicketDocument,
  makeFakeTicketDocs,
  makeFakeGroups,
  makeRecordingFigmaLinks,
  makeRecordingAttachments,
  entryFromDocument,
  makeFakeTicketIndex,
  makeTicketsLayer,
  makeTicketsFixture,
  scopeAs,
  permissionFixture,
  as
} from "./testing"
import * as TicketCommands from "./TicketCommands"
import * as TicketQueries from "./TicketQueries"

it.effect(
  "remove reconciles with an empty body so the deleted ticket's attachments are orphaned",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    const attachments = makeRecordingAttachments()
    const figmaLinks = makeRecordingFigmaLinks()
    const layer = makeTicketsLayer("T", docs.layer, {
      attachments: attachments.layer,
      figmaLinks: figmaLinks.layer,
      ticketIndex: makeFakeTicketIndex(docs.documents),
      scope: projectScope("member", "pm", {
        orgSlug: "org",
        slug: "p",
        projectId: "p",
        organizationId: "org"
      })
    })

    return Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      yield* tickets.remove("T-1")

      expect(attachments.calls).toEqual([
        { orgSlug: "org", slug: "p", ticketId: "T-1", body: "" }
      ])
      expect(figmaLinks.calls).toEqual([
        { orgSlug: "org", slug: "p", ticketId: "T-1", title: "", body: "" }
      ])
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "create, quickCreate and update reconcile figma references with the saved body",
  () => {
    const docs = makeFakeTicketDocs([])
    const figmaLinks = makeRecordingFigmaLinks()
    const layer = makeTicketsLayer("T", docs.layer, {
      figmaLinks: figmaLinks.layer,
      ticketIndex: makeFakeTicketIndex(docs.documents)
    })

    return Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      const created = yield* tickets.create({
        title: "One",
        body: "# One\nhttps://www.figma.com/design/FILEKEY123/Spec\n"
      })
      const quick = yield* tickets.quickCreate({
        title: "Two"
      })
      yield* tickets.update(created.id, {
        body: "# One\nedited\n"
      })

      expect(figmaLinks.calls.map((call) => call.ticketId)).toEqual([
        created.id,
        quick.id,
        created.id
      ])
      expect(figmaLinks.calls[0].body).toContain("figma.com")
      expect(figmaLinks.calls[2].body).toContain("edited")
    }).pipe(Effect.provide(layer))
  }
)

it.effect("create propagates ticket index write failures", () => {
  const docs = makeFakeTicketDocs([])
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(docs.documents, {
      getBranchDeletedAt: () => Effect.succeed(null),
      upsertTicket: () => Effect.die(new Error("index failed"))
    })
  })

  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const exit = yield* tickets.create({ title: "Indexed" }).pipe(Effect.exit)

    expect(exit._tag).toBe("Failure")
  }).pipe(Effect.provide(layer))
})

it.effect("create allocates the next id from the project key", () => {
  const { documents, layer } = makeTicketsFixture("FOO", ["FOO-1", "FOO-3"])
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const created = yield* tickets.create({
      title: "Add project keys"
    })

    expect(created.id).toBe("FOO-4")
    expect(created.body).toBe("")
    expect(documents.has("FOO-4")).toBe(true)
  }).pipe(Effect.provide(layer))
})

it.effect("create keeps legacy T project ids readable and sequential", () => {
  const { documents, layer } = makeTicketsFixture("T", ["T-1", "T-35"])
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const created = yield* tickets.create({
      title: "Keep legacy ids"
    })

    expect(created.id).toBe("T-36")
    expect(documents.has("T-36")).toBe(true)
  }).pipe(Effect.provide(layer))
})

it.effect(
  "create advances past an unindexed file collision without scanning the ticket directory",
  () => {
    const docs = makeFakeTicketDocs(["FOO-2"])
    const indexed = new Map([["FOO-1", makeTicketDocument("FOO-1")]])
    const layer = makeTicketsLayer("FOO", docs.layer, {
      ticketIndex: makeFakeTicketIndex(indexed, {
        listIds: () => unexpected("TicketIndex.listIds")
      })
    })

    return Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      const created = yield* tickets.create({
        title: "Skip stale collision"
      })

      expect(created.id).toBe("FOO-3")
      expect(docs.documents.has("FOO-3")).toBe(true)
    }).pipe(Effect.provide(layer))
  }
)

const makeEpicFixture = () => {
  const docs = makeFakeTicketDocs(["T-1", "T-2"])
  docs.documents.set("T-1", makeTicketDocument("T-1", { type: "epic" }))
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(docs.documents)
  })
  return { docs, layer }
}

it.effect("create files a sub-ticket under an epic", () => {
  const { docs, layer } = makeEpicFixture()
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const created = yield* tickets.quickCreate({
      title: "Estimate field",
      parent: ticketId("T-1")
    })

    expect(created.parent).toBe("T-1")
    expect(docs.documents.get(created.id)?.parent).toBe("T-1")
  }).pipe(Effect.provide(layer))
})

it.effect(
  "create rejects a sub-ticket as parent, and an epic with a parent",
  () => {
    const { docs, layer } = makeEpicFixture()
    docs.documents.set(
      "T-3",
      makeTicketDocument("T-3", { parent: ticketId("T-2") })
    )
    return Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      const underSubTicket = yield* tickets
        .create({
          title: "Child",
          parent: ticketId("T-3")
        })
        .pipe(Effect.flip)
      const nestedEpic = yield* tickets
        .create({
          title: "Nested",
          type: "epic",
          parent: ticketId("T-1")
        })
        .pipe(Effect.flip)

      expect(underSubTicket).toMatchObject({
        _tag: "Validation",
        reason: "invalid_parent:T-3"
      })
      expect(nestedEpic).toMatchObject({
        _tag: "Validation",
        reason: "epic_with_parent"
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect("deleting an epic takes its tickets out of it", () => {
  const { docs, layer } = makeEpicFixture()
  docs.documents.set(
    "T-2",
    makeTicketDocument("T-2", { parent: ticketId("T-1") })
  )
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    yield* tickets.remove("T-1")

    expect(docs.documents.has("T-1")).toBe(false)
    expect(docs.documents.get("T-2")?.parent).toBeUndefined()
  }).pipe(Effect.provide(layer))
})

it.effect("an epic keeps its type while it has tickets", () => {
  const { layer } = makeEpicFixture()
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    yield* tickets.update("T-2", {
      parent: ticketId("T-1")
    })
    const blocked = yield* tickets
      .update("T-1", { type: "feat" })
      .pipe(Effect.flip)
    yield* tickets.update("T-2", { parent: null })
    const freed = yield* tickets.update("T-1", {
      type: "feat"
    })

    expect(blocked).toMatchObject({
      _tag: "Validation",
      reason: "epic_has_tickets"
    })
    expect(freed.ticket.type).toBe("feat")
  }).pipe(Effect.provide(layer))
})

it.effect("a ticket holds sub-tickets one level deep", () => {
  const { docs, layer } = makeEpicFixture()
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const child = yield* tickets.quickCreate({
      title: "Child",
      parent: ticketId("T-2")
    })
    const grandchild = yield* tickets
      .quickCreate({ title: "Grandchild", parent: child.id })
      .pipe(Effect.flip)

    expect(docs.documents.get(child.id)?.parent).toBe("T-2")
    expect(grandchild).toMatchObject({
      _tag: "Validation",
      reason: `invalid_parent:${child.id}`
    })
  }).pipe(Effect.provide(layer))
})

it.effect(
  "a ticket with sub-tickets can move under an epic but not under a ticket or become an epic",
  () => {
    const { docs, layer } = makeEpicFixture()
    docs.documents.set("T-3", makeTicketDocument("T-3"))
    docs.documents.set(
      "T-4",
      makeTicketDocument("T-4", { parent: ticketId("T-2") })
    )
    return Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      const underTicket = yield* tickets
        .update("T-2", { parent: ticketId("T-3") })
        .pipe(Effect.flip)
      const toEpic = yield* tickets
        .update("T-2", { type: "epic" })
        .pipe(Effect.flip)
      const underEpic = yield* tickets.update("T-2", {
        parent: ticketId("T-1")
      })

      expect(underTicket).toMatchObject({
        _tag: "Validation",
        reason: "ticket_has_sub_tickets"
      })
      expect(toEpic).toMatchObject({
        _tag: "Validation",
        reason: "ticket_has_sub_tickets"
      })
      expect(underEpic.ticket.parent).toBe("T-1")
    }).pipe(Effect.provide(layer))
  }
)

it.effect("deleting with cascadeSubTickets deletes the whole subtree", () => {
  const { docs, layer } = makeEpicFixture()
  docs.documents.set(
    "T-2",
    makeTicketDocument("T-2", { parent: ticketId("T-1") })
  )
  docs.documents.set(
    "T-3",
    makeTicketDocument("T-3", { parent: ticketId("T-2") })
  )
  docs.documents.set("T-4", makeTicketDocument("T-4"))
  docs.documents.set(
    "T-5",
    makeTicketDocument("T-5", { parent: ticketId("T-4") })
  )
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    yield* tickets.remove("T-1", { cascadeSubTickets: true })

    expect([...docs.documents.keys()]).toEqual(["T-4", "T-5"])
  }).pipe(Effect.provide(layer))
})

it.effect("a ticket in an open sprint can't become an epic", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  const sprint = decodeGroupSync({
    id: "G-1",
    name: "Sprint",
    kind: "sprint",
    tickets: ["T-1"],
    color: "#123456",
    startsAt: null,
    endsAt: null,
    completedAt: null,
    createdBy: "user-1",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z"
  })
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(docs.documents),
    groups: makeFakeGroups({ list: () => Effect.succeed([sprint]) })
  })
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const error = yield* tickets
      .update("T-1", { type: "epic" })
      .pipe(Effect.flip)

    expect(error).toMatchObject({
      _tag: "Validation",
      reason: "epic_in_sprint"
    })
  }).pipe(Effect.provide(layer))
})

const bulkSprint = decodeGroupSync({
  id: "G-1",
  name: "Sprint",
  kind: "sprint",
  tickets: [],
  color: "#123456",
  startsAt: null,
  endsAt: null,
  completedAt: null,
  createdBy: "user-1",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z"
})

const makeBulkFixture = (addTickets: GroupsShape["addTickets"]) => {
  const docs = makeFakeTicketDocs(["T-1", "T-2", "T-3"])
  docs.documents.set(
    "T-3",
    makeTicketDocument("T-3", { type: "epic", title: "Estimation" })
  )
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(docs.documents),
    groups: makeFakeGroups({ list: () => Effect.succeed([]), addTickets })
  })
  return { docs, layer }
}

it.effect("bulkUpdate patches every ticket and plans them in one call", () => {
  const added: Array<ReadonlyArray<string>> = []
  const { docs, layer } = makeBulkFixture((_id, ids) =>
    Effect.sync(() => {
      added.push(ids)
      return {
        target: { ...bulkSprint, tickets: [...ids], body: "" },
        evicted: []
      }
    })
  )
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const result = yield* tickets.bulkUpdate({
      tickets: [ticketId("T-1"), ticketId("T-2")],
      patch: {
        priority: "high",
        parent: ticketId("T-3"),
        sprint: bulkSprint.id
      }
    })

    expect(result.tickets.map((ticket) => ticket.priority)).toEqual([
      "high",
      "high"
    ])
    expect(docs.documents.get("T-2")?.parent).toBe("T-3")
    expect(added).toEqual([["T-1", "T-2"]])
  }).pipe(Effect.provide(layer))
})

it.effect("bulkUpdate writes nothing when one ticket breaks a rule", () => {
  const { docs, layer } = makeBulkFixture(() => unexpected("Groups.addTickets"))
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const error = yield* tickets
      .bulkUpdate({
        tickets: [ticketId("T-1"), ticketId("T-3")],
        patch: { priority: "high", sprint: bulkSprint.id }
      })
      .pipe(Effect.flip)

    expect(error).toMatchObject({
      _tag: "Validation",
      reason: "epic_in_sprint"
    })
    expect(docs.documents.get("T-1")?.priority).toBe("med")
  }).pipe(Effect.provide(layer))
})

it.effect("bulkUpdate restores the tickets when planning fails", () => {
  const { docs, layer } = makeBulkFixture(() =>
    Effect.fail(new SprintCompletedImmutable())
  )
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const error = yield* tickets
      .bulkUpdate({
        tickets: [ticketId("T-1"), ticketId("T-2")],
        patch: { priority: "high", sprint: bulkSprint.id }
      })
      .pipe(Effect.flip)

    expect(error._tag).toBe("SprintCompletedImmutable")
    expect(docs.documents.get("T-1")?.priority).toBe("med")
    expect(docs.documents.get("T-2")?.priority).toBe("med")
  }).pipe(Effect.provide(layer))
})

it.effect("ticket mention validation trusts the ticket index", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(new Map())
  })

  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const error = yield* tickets
      .create({
        title: "Reference a ticket",
        body: "See [T-1](mention:ticket/T-1)."
      })
      .pipe(Effect.flip)

    expect(error).toMatchObject({
      _tag: "MentionInvalid",
      kind: "unknown_ticket"
    })
  }).pipe(Effect.provide(layer))
})

it.effect(
  "hands back the order key the list query gives the ticket it just wrote",
  () => {
    const docs = makeFakeTicketDocs(["T-1", "T-2", "T-3"])
    const layer = makeTicketsLayer("T", docs.layer, {
      ticketIndex: makeFakeTicketIndex(docs.documents)
    })
    return Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      const queries = yield* TicketQueries.TicketQueries
      const sort = { key: "title", dir: "asc" } as const
      const updated = yield* tickets.update("T-2", { title: "Zulu" }, sort)
      expect(updated.ticket.title).toBe("Zulu")

      const page = yield* queries.list({ sort })
      const row = page.items.find((item) => item.ticket.id === "T-2")
      expect(updated.orderKey).toBe(row?.orderKey)
      expect(page.items.map((item) => item.ticket.id)).toEqual([
        "T-1",
        "T-3",
        "T-2"
      ])
    }).pipe(Effect.provide(layer))
  }
)

it.effect("omits the order key when no sort is asked for", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(docs.documents)
  })
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const updated = yield* tickets.update("T-1", {
      title: "Quiet"
    })
    expect(updated.orderKey).toBeNull()
  }).pipe(Effect.provide(layer))
})

it.effect(
  "rejects a template body when the ticket changed after it was read",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    const layer = makeTicketsLayer("T", docs.layer, {
      ticketIndex: makeFakeTicketIndex(docs.documents)
    })
    return Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      const queries = yield* TicketQueries.TicketQueries
      const read = yield* queries.get("T-1")
      docs.documents.set(
        "T-1",
        makeTicketDocument("T-1", { body: "A concurrent edit" })
      )

      const error = yield* tickets
        .update("T-1", { body: "Template content" }, undefined, {
          body: read.body
        })
        .pipe(Effect.flip)

      expect(error).toMatchObject({
        _tag: "Validation",
        reason: "ticket_body_changed"
      })
      expect(docs.documents.get("T-1")?.body).toBe("A concurrent edit")
    }).pipe(Effect.provide(layer))
  }
)

it.effect("rejects an update when the ticket changed after it was read", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(docs.documents)
  })
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const queries = yield* TicketQueries.TicketQueries
    const read = yield* queries.get("T-1")
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", {
        body: "A concurrent edit",
        updatedAt: isoDate("2026-04-02T00:00:00.000Z")
      })
    )

    const error = yield* tickets
      .update("T-1", { body: "Stale rewrite" }, undefined, {
        updatedAt: read.updatedAt
      })
      .pipe(Effect.flip)

    expect(error).toMatchObject({
      _tag: "Conflict",
      reason: "ticket_updated_since_read"
    })
    expect(docs.documents.get("T-1")?.body).toBe("A concurrent edit")

    const updated = yield* tickets.update(
      "T-1",
      { body: "Fresh rewrite" },
      undefined,
      { updatedAt: isoDate("2026-04-02T00:00:00.000Z") }
    )
    expect(updated.ticket.body).toBe("Fresh rewrite")
  }).pipe(Effect.provide(layer))
})

it.effect(
  "metadata edits skip attachment reconciliation while body edits retain it",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    const attachments = makeRecordingAttachments()
    const layer = makeTicketsLayer("T", docs.layer, {
      attachments: attachments.layer
    })
    return Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      yield* tickets.update("T-1", {
        title: "New title",
        priority: "high"
      })
      expect(attachments.calls).toEqual([])
      yield* tickets.update("T-1", {
        body: "Updated description"
      })
      expect(attachments.calls).toEqual([
        {
          orgSlug: "org",
          slug: "p",
          ticketId: "T-1",
          body: "Updated description"
        }
      ])
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "lets a client edit any ticket and change its status and assignees",
  () => {
    const { docs, layer } = permissionFixture()
    const client = as(scopeAs("guest", "client", "client-1"))
    return Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      yield* tickets
        .update("T-1", {
          title: "Clearer title",
          status: ticketStatus("done"),
          assignees: ["user-1"]
        })
        .pipe(client)
      expect(docs.documents.get("T-1")).toMatchObject({
        title: "Clearer title",
        status: "done",
        assignees: ["user-1"],
        updatedBy: "client-1"
      })
      const created = yield* tickets
        .create({
          title: "Placed",
          status: ticketStatus("in_progress"),
          assignees: ["user-1"]
        })
        .pipe(client)
      expect(created.status).toBe("in_progress")
    }).pipe(Effect.provide(layer))
  }
)

it.effect("rejects statuses the project doesn't have", () => {
  const { docs, layer } = permissionFixture()
  const pm = as(scopeAs("member", "pm", "user-1"))
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const updating = yield* Effect.flip(
      tickets.update("T-1", { status: ticketStatus("bogus") }).pipe(pm)
    )
    const creating = yield* Effect.flip(
      tickets.create({ title: "New", status: ticketStatus("bogus") }).pipe(pm)
    )
    expect([updating._tag, creating._tag]).toStrictEqual([
      "Validation",
      "Validation"
    ])
    expect(docs.documents.get("T-1")?.status).toBe("todo")
  }).pipe(Effect.provide(layer))
})

it.effect(
  "clears old-unit estimates on active and archived tickets while retaining current-unit estimates",
  () => {
    const docs = makeFakeTicketDocs(["T-1", "T-2", "T-3", "T-4"])
    for (const [id, archived, unit] of [
      ["T-1", false, "time"],
      ["T-2", true, "time"],
      ["T-3", false, "points"],
      ["T-4", true, "points"]
    ] as const) {
      docs.documents.set(
        id,
        makeTicketDocument(id, {
          estimate:
            unit === "time" ? { unit, minutes: 60 } : { unit, value: 5 },
          archivedAt: archived ? isoDate("2026-04-01T00:00:00Z") : null
        })
      )
    }
    const layer = makeTicketsLayer("T", docs.layer, {
      ticketIndex: makeFakeTicketIndex(docs.documents)
    })
    return Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      expect(yield* tickets.clearStaleEstimates()).toEqual({ cleared: 2 })
      expect(docs.documents.get("T-1")?.estimate).toBeUndefined()
      expect(docs.documents.get("T-2")?.estimate).toBeUndefined()
      expect(docs.documents.get("T-2")?.archivedAt).not.toBeNull()
      expect(docs.documents.get("T-3")?.estimate).toEqual({
        unit: "points",
        value: 5
      })
      expect(docs.documents.get("T-4")?.estimate).toEqual({
        unit: "points",
        value: 5
      })
      expect(yield* tickets.clearStaleEstimates()).toEqual({ cleared: 0 })
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "preserves estimates made current by a mode change during bulk cleanup",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", { estimate: { unit: "time", minutes: 60 } })
    )
    let switched = false
    const layer = makeTicketsLayer("T", docs.layer, {
      projectDocs: Layer.mock(ProjectDocs, {
        read: (_org, slug) =>
          Effect.succeed({
            slug,
            name: slug,
            icon: "folder",
            color: "#3b82f6",
            createdAt: isoDate("2026-01-01T00:00:00Z"),
            github: null,
            estimation: switched ? "time" : "points",
            body: "",
            templateDefaults: {},
            setup: {
              workflowReviewedAt: null,
              invitePeopleDismissedAt: null,
              connectGithubDismissedAt: null
            }
          })
      }),
      ticketIndex: makeFakeTicketIndex(docs.documents, {
        query: () =>
          Effect.sync(() => {
            switched = true
            const current = docs.documents.get("T-1")
            if (!current) throw new Error("Ticket fixture missing")
            return [
              { entry: entryFromDocument(current), sortValue: "", orderKey: "" }
            ]
          })
      })
    })
    return Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      expect(yield* tickets.clearStaleEstimates()).toEqual({ cleared: 0 })
      expect(docs.documents.get("T-1")?.estimate).toEqual({
        unit: "time",
        minutes: 60
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "preserves an estimate changed to the current unit after cleanup selection",
  () => {
    const docs = makeFakeTicketDocs(["T-1"])
    docs.documents.set(
      "T-1",
      makeTicketDocument("T-1", { estimate: { unit: "time", minutes: 60 } })
    )
    const layer = makeTicketsLayer("T", docs.layer, {
      ticketIndex: makeFakeTicketIndex(docs.documents, {
        query: () =>
          Effect.sync(() => {
            const previous = docs.documents.get("T-1")
            if (!previous) throw new Error("Ticket fixture missing")
            docs.documents.set("T-1", {
              ...previous,
              estimate: { unit: "points", value: 8 }
            })
            return [
              {
                entry: entryFromDocument(previous),
                sortValue: "",
                orderKey: ""
              }
            ]
          })
      })
    })
    return Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      expect(yield* tickets.clearStaleEstimates()).toEqual({ cleared: 0 })
      expect(docs.documents.get("T-1")?.estimate).toEqual({
        unit: "points",
        value: 8
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect("only accepts estimates in the project's estimation unit", () => {
  const { docs, layer } = permissionFixture()
  const pm = as(scopeAs("member", "pm", "user-1"))
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const mismatched = yield* Effect.flip(
      tickets
        .update("T-1", { estimate: { unit: "tshirt", value: "M" } })
        .pipe(pm)
    )
    expect(mismatched._tag).toBe("Validation")
    expect(docs.documents.get("T-1")?.estimate).toBeUndefined()

    yield* tickets
      .update("T-1", { estimate: { unit: "points", value: 5 } })
      .pipe(pm)
    expect(docs.documents.get("T-1")?.estimate).toEqual({
      unit: "points",
      value: 5
    })

    yield* tickets.update("T-1", { estimate: null }).pipe(pm)
    expect(docs.documents.get("T-1")?.estimate).toBeUndefined()
  }).pipe(Effect.provide(layer))
})

it.effect(
  "moves a ticket on the sprint board only with permission to transition it",
  () => {
    const docs = makeFakeTicketDocs([])
    docs.documents.set("T-1", makeTicketDocument("T-1"))
    const orders: Array<unknown> = []
    const sprint = decodeGroupDetailSync({
      id: "G-1",
      name: "Sprint",
      kind: "sprint",
      tickets: ["T-1"],
      color: "#123456",
      startsAt: null,
      endsAt: null,
      completedAt: null,
      createdBy: "user-1",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
      body: ""
    })
    const layer = makeTicketsLayer("T", docs.layer, {
      ticketIndex: makeFakeTicketIndex(docs.documents),
      groups: makeFakeGroups({
        updateTicketOrder: (_id, input, beforeWrite = Effect.void) =>
          beforeWrite.pipe(
            Effect.andThen(
              Effect.sync(() => {
                orders.push(input)
                return sprint
              })
            )
          )
      })
    })
    return Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      const move = { ticketId: ticketId("T-1"), after: null }
      const readOnly = yield* Effect.flip(
        tickets
          .moveInGroup("G-1", { ...move, status: ticketStatus("done") })
          .pipe(as(scopeAs("admin", null, "admin-1")))
      )
      const unknown = yield* Effect.flip(
        tickets
          .moveInGroup("G-1", { ...move, status: ticketStatus("bogus") })
          .pipe(as(scopeAs("guest", "client", "client-1")))
      )
      expect([readOnly._tag, unknown._tag]).toStrictEqual([
        "Forbidden",
        "Validation"
      ])
      expect(orders).toStrictEqual([])

      yield* tickets
        .moveInGroup("G-1", { ...move, status: ticketStatus("in_progress") })
        .pipe(as(scopeAs("guest", "client", "client-1")))
      expect(orders).toStrictEqual([move])
      expect(docs.documents.get("T-1")).toMatchObject({
        status: "in_progress",
        updatedBy: "client-1"
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect("keeps org admins without a role from editing", () => {
  const { docs, layer } = permissionFixture()
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const queries = yield* TicketQueries.TicketQueries
    const adminView = yield* queries
      .get("T-1")
      .pipe(as(scopeAs("admin", null, "admin-1")))
    const adminEdit = yield* Effect.flip(
      tickets
        .update("T-1", { title: "Admin" })
        .pipe(as(scopeAs("admin", null, "admin-1")))
    )
    expect(adminView.id).toBe("T-1")
    expect(adminEdit._tag).toBe("Forbidden")
    expect(docs.documents.has("T-1")).toBe(true)
  }).pipe(Effect.provide(layer))
})
