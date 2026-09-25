import { it } from "@effect/vitest"
import {
  GroupId,
  NotFound,
  TicketId,
  TicketStatus,
  ProjectScope
} from "@pp/shared"
import type { GroupDetail, OrgRole, Role } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as TestClock from "effect/testing/TestClock"
import { expect } from "vitest"

import { projectScope } from "../access/testing"
import * as KeyedLock from "../locks/KeyedLock"
import { GroupIdTaken } from "../markdown/Markdown"
import {
  TicketDocs,
  type TicketDocsShape,
  type TicketDocument
} from "../tickets/TicketDocs"
import * as TicketDocumentLock from "../tickets/ticketDocumentLock"
import { TicketIndex, type TicketIndexShape } from "../tickets/TicketIndex"
import { GroupDocs, type GroupDocsShape, type GroupDocument } from "./GroupDocs"
import { Groups } from "./Groups"
import { GroupsLive } from "./GroupsLive"

const isoDate = (s: string) => DateTime.toDate(DateTime.makeUnsafe(s))
const setTestNow = TestClock.setTime(
  DateTime.toEpochMillis(DateTime.makeUnsafe("2026-05-19T00:00:00.000Z"))
)

const groupId = Schema.decodeUnknownSync(GroupId)
const ticketId = Schema.decodeUnknownSync(TicketId)
const ticketStatus = Schema.decodeUnknownSync(TicketStatus)

function unexpectedTicketDocsCall(method: string): Effect.Effect<never> {
  return Effect.die(new Error(`unexpected TicketDocs.${method} call`))
}

const defaultTicketStatus = ticketStatus("todo")

function makeTicketDocument(
  id: string,
  status: TicketStatus = defaultTicketStatus
): TicketDocument {
  const now = isoDate("2026-04-01T00:00:00.000Z")
  return {
    id: ticketId(id),
    title: id,
    status,
    type: "other",
    priority: "med",
    tags: [],
    branch: null,
    pr: null,
    prState: null,
    lastTransitionedPr: null,
    assignees: [],
    archivedAt: null,
    createdBy: "user-1",
    createdAt: now,
    updatedBy: "user-1",
    updatedAt: now,
    body: "",
    commentsRegion: ""
  }
}

function ticketIndexEntryFromDocument(ticket: TicketDocument) {
  const { body: _body, commentsRegion: _commentsRegion, ...entry } = ticket
  return {
    ...entry,
    branchDeletedAt: null,
    checks: null,
    checksHeadSha: null,
    checksUpdatedAt: null
  }
}

function makeFakeDocs(initial?: {
  ticketIds?: ReadonlyArray<string>
  ticketStatuses?: Record<string, TicketStatus>
  groups?: Record<string, GroupDetail>
}) {
  const groups = new Map<string, GroupDocument>(
    Object.entries(initial?.groups ?? {})
  )
  const ticketIds = [...(initial?.ticketIds ?? [])]
  const ticketsById = new Map<string, TicketDocument>(
    ticketIds.map((id) => [
      id,
      makeTicketDocument(
        id,
        initial?.ticketStatuses?.[id] ?? defaultTicketStatus
      )
    ])
  )

  const groupWrites: Array<{ id: string }> = []

  const groupService = {
    listIds: () => Effect.succeed([...groups.keys()].map((id) => groupId(id))),
    read: (_org: string, _slug: string, id: string) => {
      const group = groups.get(id)
      return group ? Effect.succeed(group) : Effect.fail(new NotFound())
    },
    create: (_org: string, _slug: string, document: GroupDocument) => {
      if (groups.has(document.id)) {
        return Effect.fail(new GroupIdTaken())
      }
      groups.set(document.id, document)
      return Effect.void
    },
    write: (
      _org: string,
      _slug: string,
      id: string,
      document: GroupDocument
    ) => {
      groupWrites.push({ id })
      groups.set(id, document)
      return Effect.void
    },
    writeIfExists: (
      _org: string,
      _slug: string,
      id: string,
      document: GroupDocument
    ) => {
      if (!groups.has(id)) return Effect.fail(new NotFound())
      groupWrites.push({ id })
      groups.set(id, document)
      return Effect.void
    },
    remove: (_org: string, _slug: string, id: string) => {
      if (!groups.has(id)) return Effect.fail(new NotFound())
      groups.delete(id)
      return Effect.void
    },
    readRaw: () => Effect.die(new Error("unexpected GroupDocs.readRaw call"))
  } satisfies GroupDocsShape

  const ticketService: TicketDocsShape = {
    listIds: () =>
      Effect.succeed([...ticketsById.keys()].map((id) => ticketId(id))),
    read: (_org: string, _slug: string, id: string) => {
      const ticket = ticketsById.get(id)
      return ticket ? Effect.succeed(ticket) : Effect.fail(new NotFound())
    },
    create: () => unexpectedTicketDocsCall("create"),
    write: (
      _org: string,
      _slug: string,
      id: string,
      document: TicketDocument
    ) => {
      ticketsById.set(id, document)
      return Effect.void
    },
    update: (org: string, slug: string, id: string, transform, onPersist) =>
      ticketService.read(org, slug, id).pipe(
        Effect.flatMap(transform),
        Effect.tap((document) =>
          Effect.sync(() => ticketsById.set(id, document))
        ),
        Effect.tap((document) =>
          onPersist ? onPersist(document) : Effect.void
        )
      ),
    remove: () => unexpectedTicketDocsCall("remove"),
    readRaw: () => unexpectedTicketDocsCall("readRaw")
  }

  const indexProject = {
    orgSlug: "org",
    organizationId: "org-1",
    projectId: "project-1",
    projectSlug: "p"
  }

  const ticketIndexService = {
    projectsFor: () => Effect.succeed([]),
    assignedTo: () => Effect.succeed([]),
    touchedBy: () => Effect.succeed([]),
    countAssignedByStatus: () => Effect.succeed([]),
    assignedPerProject: () => Effect.succeed([]),
    projectFor: () => Effect.succeed(indexProject),
    list: (_project, requestedIds) =>
      Effect.sync(() => {
        const requested =
          requestedIds === undefined ? null : new Set(requestedIds)
        return [...ticketsById.values()]
          .filter((ticket) => requested === null || requested.has(ticket.id))
          .map(ticketIndexEntryFromDocument)
      }),
    query: () => Effect.die(new Error("unexpected TicketIndex.query")),
    orderKeyFor: () =>
      Effect.die(new Error("unexpected TicketIndex.orderKeyFor")),
    count: () => Effect.die(new Error("unexpected TicketIndex.count")),
    listIds: () => Effect.succeed([...ticketsById.keys()]),
    existingIds: (_project, ticketIds) =>
      Effect.succeed(
        new Set(ticketIds.filter((ticketId) => ticketsById.has(ticketId)))
      ),
    reserveTicketNumber: () =>
      Effect.sync(
        () =>
          Math.max(
            0,
            ...[...ticketsById.keys()].map((id) => Number(id.slice(2)))
          ) + 1
      ),
    tagUsageCounts: () => Effect.succeed({}),
    findTicketIdsByTag: () => Effect.succeed([]),
    findTicketIdsByStatus: () => Effect.succeed([]),
    findTicketsByBranch: () => Effect.succeed([]),
    isRepositoryBranchAttached: () => Effect.succeed(false),
    getBranchDeletedAt: () => Effect.succeed(null),
    upsertTicket: (_project, document) =>
      Effect.sync(() => {
        ticketsById.set(document.id, document)
      }),
    markBranchStale: () => Effect.succeed([]),
    clearBranchStale: () => Effect.void,
    updateBranchChecks: () => Effect.succeed([]),
    deleteTicket: (_project, id) =>
      Effect.sync(() => {
        ticketsById.delete(id)
      }),
    rebuildProject: () =>
      Effect.succeed({
        project: indexProject,
        indexed: ticketsById.size,
        skipped: 0
      }),
    rebuildAllProjects: () => Effect.succeed({ projects: [] }),
    reconcileProject: () =>
      Effect.succeed({
        project: indexProject,
        drift: { missing: [], orphaned: [], stale: [] },
        rebuilt: false,
        indexed: ticketsById.size,
        skipped: 0
      }),
    reconcileAllProjects: () => Effect.succeed({ projects: [], reconciled: 0 })
  } satisfies TicketIndexShape

  return {
    state: { groups, ticketIds, ticketsById, groupWrites },
    groupLayer: Layer.succeed(GroupDocs, groupService),
    ticketLayer: Layer.succeed(TicketDocs, ticketService),
    ticketIndexLayer: Layer.succeed(TicketIndex, ticketIndexService)
  }
}

const asScope = (orgRole: OrgRole, role: Role | null) =>
  projectScope(orgRole, role, { orgSlug: "org", slug: "p" })

const scopeLayer = (role: Role = "developer") =>
  Layer.succeed(ProjectScope, asScope("member", role))

function groupsLayer(docs?: Parameters<typeof makeFakeDocs>[0]) {
  const fakeDocs = makeFakeDocs(docs)
  return GroupsLive.pipe(
    Layer.provide(fakeDocs.groupLayer),
    Layer.provide(fakeDocs.ticketLayer),
    Layer.provide(fakeDocs.ticketIndexLayer),
    Layer.provide(TicketDocumentLock.layer),
    Layer.provide(KeyedLock.layer)
  )
}

function makeGroupsLayer(
  docs?: Parameters<typeof makeFakeDocs>[0],
  projects?: { role?: Role }
) {
  return groupsLayer(docs).pipe(Layer.merge(scopeLayer(projects?.role)))
}

it.effect("create + list returns the new group", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({
      name: "Backlog cleanup"
    })
    expect(created.id).toBe("G-1")
    expect(created.kind).toBe("other")

    const list = yield* groups.list()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe("Backlog cleanup")
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "developer" })))
)

it.effect("create with kind=sprint fails for non-admin member", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const result = yield* Effect.result(
      groups.create({
        name: "Sprint 1",
        kind: "sprint"
      })
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("Forbidden")
    }
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "developer" })))
)

it.effect("create with kind=sprint succeeds for admin", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({
      name: "Sprint 1",
      kind: "sprint"
    })
    expect(created.kind).toBe("sprint")
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "pm" })))
)

it.effect("updateTickets rejects unknown ticket ids", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({
      name: "G"
    })
    const result = yield* Effect.result(
      groups.updateTickets(created.id, {
        tickets: [ticketId("T-99")]
      })
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("NotFound")
    }
  }).pipe(
    Effect.provide(
      makeGroupsLayer({ ticketIds: ["T-1"] }, { role: "developer" })
    )
  )
)

it.effect("updateTickets returns NotFound before validating tickets", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const result = yield* Effect.result(
      groups.updateTickets("G-404", {
        tickets: [ticketId("T-99")]
      })
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("NotFound")
    }
  }).pipe(
    Effect.provide(
      makeGroupsLayer({ ticketIds: ["T-1"] }, { role: "developer" })
    )
  )
)

it.effect("create rejects endsAt before startsAt", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const result = yield* Effect.result(
      groups.create({
        name: "G",
        startsAt: isoDate("2026-06-01"),
        endsAt: isoDate("2026-05-01")
      })
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("Validation")
    }
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "developer" })))
)

it.effect("update rejects endsAt before existing startsAt", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({
      name: "G",
      startsAt: isoDate("2026-06-01"),
      endsAt: isoDate("2026-07-01")
    })
    const result = yield* Effect.result(
      groups.update(created.id, {
        endsAt: isoDate("2026-05-15")
      })
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("Validation")
    }
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "developer" })))
)

it.effect("update rejects completedAt in the future", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({ name: "G" })
    const future = DateTime.toDate(
      DateTime.add(DateTime.nowUnsafe(), { days: 1 })
    )
    const result = yield* Effect.result(
      groups.update(created.id, {
        completedAt: future
      })
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("Validation")
    }
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "developer" })))
)

it.effect("update rejects completedAt before startsAt", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({
      name: "G",
      startsAt: isoDate("2026-04-01"),
      endsAt: isoDate("2026-04-30")
    })
    const result = yield* Effect.result(
      groups.update(created.id, {
        completedAt: isoDate("2026-03-01")
      })
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("Validation")
    }
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "developer" })))
)

it.effect(
  "updateTickets against a sprint auto-evicts overlapping ids from other non-completed sprints",
  () =>
    Effect.gen(function* () {
      const groups = yield* Groups
      const sprintA = yield* groups.create({
        name: "Sprint A",
        kind: "sprint",
        tickets: [ticketId("T-1"), ticketId("T-2")]
      })
      const sprintB = yield* groups.create({
        name: "Sprint B",
        kind: "sprint"
      })
      const epic = yield* groups.create({
        name: "Epic",
        tickets: [ticketId("T-1")]
      })

      const result = yield* groups.updateTickets(sprintB.id, {
        tickets: [ticketId("T-1")]
      })

      expect(result.target.id).toBe(sprintB.id)
      expect(result.target.tickets).toEqual(["T-1"])
      expect(result.evicted).toHaveLength(1)
      expect(result.evicted[0].groupId).toBe(sprintA.id)
      expect(result.evicted[0].ticketIds).toEqual(["T-1"])

      const sprintAAfter = yield* groups.get(sprintA.id)
      expect(sprintAAfter.tickets).toEqual(["T-2"])

      const epicAfter = yield* groups.get(epic.id)
      expect(epicAfter.tickets).toEqual(["T-1"])
    }).pipe(
      Effect.provide(
        makeGroupsLayer({ ticketIds: ["T-1", "T-2"] }, { role: "pm" })
      )
    )
)

it.effect(
  "updateTickets against a completed sprint fails with SprintCompletedImmutable",
  () =>
    Effect.gen(function* () {
      yield* setTestNow
      const groups = yield* Groups
      const sprint = yield* groups.create({
        name: "Sprint",
        kind: "sprint",
        startsAt: isoDate("2026-04-01"),
        endsAt: isoDate("2026-04-15")
      })
      yield* groups.update(sprint.id, {
        completedAt: isoDate("2026-04-15")
      })
      const result = yield* Effect.result(
        groups.updateTickets(sprint.id, {
          tickets: [ticketId("T-1")]
        })
      )
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(result.failure._tag).toBe("SprintCompletedImmutable")
      }
    }).pipe(
      Effect.provide(makeGroupsLayer({ ticketIds: ["T-1"] }, { role: "pm" }))
    )
)

it.effect(
  "updateTickets against a sprint does not evict from completed sprints",
  () =>
    Effect.gen(function* () {
      yield* setTestNow
      const groups = yield* Groups
      const completed = yield* groups.create({
        name: "Completed",
        kind: "sprint",
        startsAt: isoDate("2026-03-01"),
        endsAt: isoDate("2026-03-15"),
        tickets: [ticketId("T-1")]
      })
      yield* groups.update(completed.id, {
        completedAt: isoDate("2026-03-15")
      })
      const active = yield* groups.create({
        name: "Active",
        kind: "sprint"
      })

      const result = yield* groups.updateTickets(active.id, {
        tickets: [ticketId("T-1")]
      })

      expect(result.evicted).toHaveLength(0)
      const completedAfter = yield* groups.get(completed.id)
      expect(completedAfter.tickets).toEqual(["T-1"])
    }).pipe(
      Effect.provide(makeGroupsLayer({ ticketIds: ["T-1"] }, { role: "pm" }))
    )
)

it.effect(
  "complete to backlog: 'done' tickets stay, others fall off the source",
  () =>
    Effect.gen(function* () {
      yield* setTestNow
      const groups = yield* Groups
      const sprint = yield* groups.create({
        name: "Sprint",
        kind: "sprint",
        startsAt: isoDate("2026-03-01"),
        endsAt: isoDate("2026-03-15"),
        tickets: [ticketId("T-1"), ticketId("T-2"), ticketId("T-3")]
      })

      const result = yield* groups.complete(sprint.id, {
        destination: { kind: "backlog" }
      })

      expect(result.target.completedAt).not.toBeNull()
      expect(result.target.tickets).toEqual(["T-2"])
      expect(result.carried.toSorted()).toEqual(["T-1", "T-3"])
    }).pipe(
      Effect.provide(
        makeGroupsLayer(
          {
            ticketIds: ["T-1", "T-2", "T-3"],
            ticketStatuses: {
              "T-1": ticketStatus("todo"),
              "T-2": ticketStatus("done"),
              "T-3": ticketStatus("in_progress")
            }
          },
          { role: "pm" }
        )
      )
    )
)

it.effect(
  "complete to sprint: carryover tickets land on the destination, deduped",
  () =>
    Effect.gen(function* () {
      yield* setTestNow
      const groups = yield* Groups
      const source = yield* groups.create({
        name: "Source",
        kind: "sprint",
        startsAt: isoDate("2026-03-01"),
        endsAt: isoDate("2026-03-15"),
        tickets: [ticketId("T-1"), ticketId("T-2"), ticketId("T-3")]
      })
      const dest = yield* groups.create({
        name: "Dest",
        kind: "sprint",
        startsAt: isoDate("2026-03-15"),
        endsAt: isoDate("2026-03-29"),
        tickets: [ticketId("T-3"), ticketId("T-4")]
      })

      const result = yield* groups.complete(source.id, {
        destination: { kind: "sprint", groupId: dest.id }
      })

      expect(result.carried.toSorted()).toEqual(["T-1", "T-3"])

      const sourceAfter = yield* groups.get(source.id)
      expect(sourceAfter.tickets).toEqual(["T-2"])
      expect(sourceAfter.completedAt).not.toBeNull()

      const destAfter = yield* groups.get(dest.id)
      expect(destAfter.tickets).toEqual(["T-3", "T-4", "T-1"])
      expect(destAfter.completedAt).toBeNull()
    }).pipe(
      Effect.provide(
        makeGroupsLayer(
          {
            ticketIds: ["T-1", "T-2", "T-3", "T-4"],
            ticketStatuses: {
              "T-1": ticketStatus("todo"),
              "T-2": ticketStatus("done"),
              "T-3": ticketStatus("in_progress"),
              "T-4": ticketStatus("todo")
            }
          },
          { role: "pm" }
        )
      )
    )
)

it.effect(
  "complete on an already-completed sprint fails with SprintCompletedImmutable",
  () =>
    Effect.gen(function* () {
      yield* setTestNow
      const groups = yield* Groups
      const sprint = yield* groups.create({
        name: "Sprint",
        kind: "sprint",
        startsAt: isoDate("2026-03-01"),
        endsAt: isoDate("2026-03-15")
      })
      yield* groups.update(sprint.id, {
        completedAt: isoDate("2026-03-15")
      })

      const result = yield* Effect.result(
        groups.complete(sprint.id, {
          destination: { kind: "backlog" }
        })
      )

      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(result.failure._tag).toBe("SprintCompletedImmutable")
      }
    }).pipe(Effect.provide(makeGroupsLayer({ ticketIds: [] }, { role: "pm" })))
)

it.effect(
  "complete fails with SprintCompletedImmutable when destination is already completed",
  () =>
    Effect.gen(function* () {
      yield* setTestNow
      const groups = yield* Groups
      const source = yield* groups.create({
        name: "Source",
        kind: "sprint",
        startsAt: isoDate("2026-03-01"),
        endsAt: isoDate("2026-03-15")
      })
      const dest = yield* groups.create({
        name: "Dest",
        kind: "sprint",
        startsAt: isoDate("2026-03-15"),
        endsAt: isoDate("2026-03-29")
      })
      yield* groups.update(dest.id, {
        completedAt: isoDate("2026-03-29")
      })

      const result = yield* Effect.result(
        groups.complete(source.id, {
          destination: { kind: "sprint", groupId: dest.id }
        })
      )

      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(result.failure._tag).toBe("SprintCompletedImmutable")
      }
    }).pipe(Effect.provide(makeGroupsLayer({ ticketIds: [] }, { role: "pm" })))
)

it.effect("complete fails with Validation when source is not a sprint", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const epic = yield* groups.create({
      name: "Epic",
      kind: "epic"
    })

    const result = yield* Effect.result(
      groups.complete(epic.id, {
        destination: { kind: "backlog" }
      })
    )

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("Validation")
    }
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "pm" })))
)

it.effect(
  "complete fails with Validation when destination is not a sprint",
  () =>
    Effect.gen(function* () {
      const groups = yield* Groups
      const source = yield* groups.create({
        name: "Source",
        kind: "sprint",
        startsAt: isoDate("2026-03-01"),
        endsAt: isoDate("2026-03-15")
      })
      const epic = yield* groups.create({
        name: "Epic",
        kind: "epic"
      })

      const result = yield* Effect.result(
        groups.complete(source.id, {
          destination: { kind: "sprint", groupId: epic.id }
        })
      )

      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(result.failure._tag).toBe("Validation")
      }
    }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "pm" })))
)

it.effect("complete fails for non-admin members", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const result = yield* Effect.result(
      groups.complete("G-1", {
        destination: { kind: "backlog" }
      })
    )

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(["Forbidden", "NotFound"]).toContain(result.failure._tag)
    }
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "developer" })))
)

it.effect("updateTicketOrder reorders within the same status", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({
      name: "G",
      tickets: [ticketId("T-1"), ticketId("T-2"), ticketId("T-3")]
    })
    const updated = yield* groups.updateTicketOrder(created.id, {
      ticketId: ticketId("T-1"),
      after: ticketId("T-2")
    })
    expect(updated.tickets).toEqual(["T-2", "T-1", "T-3"])
  }).pipe(
    Effect.provide(
      makeGroupsLayer(
        { ticketIds: ["T-1", "T-2", "T-3"] },
        { role: "developer" }
      )
    )
  )
)

it.effect("updateTicketOrder places at the start when after is null", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({
      name: "G",
      tickets: [ticketId("T-1"), ticketId("T-2"), ticketId("T-3")]
    })
    const updated = yield* groups.updateTicketOrder(created.id, {
      ticketId: ticketId("T-3"),
      after: null
    })
    expect(updated.tickets).toEqual(["T-3", "T-1", "T-2"])
  }).pipe(
    Effect.provide(
      makeGroupsLayer(
        { ticketIds: ["T-1", "T-2", "T-3"] },
        { role: "developer" }
      )
    )
  )
)

it.effect("updateTicketOrder patches ticket status when provided", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({
      name: "G",
      tickets: [ticketId("T-1"), ticketId("T-2")]
    })
    const updated = yield* groups.updateTicketOrder(created.id, {
      ticketId: ticketId("T-1"),
      status: ticketStatus("in_progress"),
      after: ticketId("T-2")
    })
    expect(updated.tickets).toEqual(["T-2", "T-1"])
  }).pipe(
    Effect.provide(
      makeGroupsLayer(
        {
          ticketIds: ["T-1", "T-2"],
          ticketStatuses: {
            "T-1": ticketStatus("todo"),
            "T-2": ticketStatus("in_progress")
          }
        },
        { role: "developer" }
      )
    )
  )
)

it.effect("updateTicketOrder rejects when ticket is not in the group", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({
      name: "G",
      tickets: [ticketId("T-1")]
    })
    const result = yield* Effect.result(
      groups.updateTicketOrder(created.id, {
        ticketId: ticketId("T-2"),
        after: null
      })
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("NotFound")
    }
  }).pipe(
    Effect.provide(
      makeGroupsLayer({ ticketIds: ["T-1", "T-2"] }, { role: "developer" })
    )
  )
)

it.effect("updateTicketOrder rejects when after refers to itself", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({
      name: "G",
      tickets: [ticketId("T-1"), ticketId("T-2")]
    })
    const result = yield* Effect.result(
      groups.updateTicketOrder(created.id, {
        ticketId: ticketId("T-1"),
        after: ticketId("T-1")
      })
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("Validation")
    }
  }).pipe(
    Effect.provide(
      makeGroupsLayer({ ticketIds: ["T-1", "T-2"] }, { role: "developer" })
    )
  )
)

it.effect("updateTicketOrder rejects on completed sprint", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({
      name: "S",
      kind: "sprint",
      tickets: [ticketId("T-1"), ticketId("T-2")]
    })
    yield* groups.complete(created.id, {
      destination: { kind: "backlog" }
    })
    const result = yield* Effect.result(
      groups.updateTicketOrder(created.id, {
        ticketId: ticketId("T-1"),
        after: null
      })
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("SprintCompletedImmutable")
    }
  }).pipe(
    Effect.provide(
      makeGroupsLayer(
        {
          ticketIds: ["T-1", "T-2"],
          ticketStatuses: {
            "T-1": ticketStatus("done"),
            "T-2": ticketStatus("done")
          }
        },
        { role: "pm" }
      )
    )
  )
)

function makeSprintDoc(
  id: string,
  overrides: Partial<GroupDocument> = {}
): GroupDocument {
  const now = isoDate("2026-05-01T00:00:00.000Z")
  return {
    id: groupId(id),
    name: id,
    kind: "sprint",
    tickets: [],
    color: "#abcdef" as GroupDocument["color"],
    startsAt: null,
    endsAt: null,
    completedAt: null,
    createdBy: "user-1",
    createdAt: now,
    updatedAt: now,
    body: "",
    ...overrides
  }
}

it.effect("listPaged filters by kind", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const page = yield* groups.listPaged({ kind: ["sprint"] }, undefined, 50)
    expect(page.items.map((g) => g.id)).toEqual(["G-1", "G-3"])
  }).pipe(
    Effect.provide(
      makeGroupsLayer(
        {
          groups: {
            "G-1": makeSprintDoc("G-1"),
            "G-2": makeSprintDoc("G-2", { kind: "epic" }),
            "G-3": makeSprintDoc("G-3")
          }
        },
        { role: "pm" }
      )
    )
  )
)

it.effect("listPaged active=true keeps only running sprints", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const page = yield* groups.listPaged({ active: true }, undefined, 50)
    expect(page.items.map((g) => g.id)).toEqual(["G-1"])
  }).pipe(
    Effect.provide(
      makeGroupsLayer(
        {
          groups: {
            "G-1": makeSprintDoc("G-1"),
            "G-2": makeSprintDoc("G-2", {
              completedAt: isoDate("2026-04-15T00:00:00.000Z")
            }),
            "G-3": makeSprintDoc("G-3", { kind: "epic" })
          }
        },
        { role: "pm" }
      )
    )
  )
)

it.effect("listSprintsPaged filters by state=active", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const page = yield* groups.listSprintsPaged("active", undefined, 50)
    expect(page.items.map((g) => g.id)).toEqual(["G-1"])
  }).pipe(
    Effect.provide(
      makeGroupsLayer(
        {
          groups: {
            "G-1": makeSprintDoc("G-1"),
            "G-2": makeSprintDoc("G-2", {
              completedAt: isoDate("2026-04-15T00:00:00.000Z")
            }),
            "G-3": makeSprintDoc("G-3", {
              startsAt: isoDate("2099-01-01T00:00:00.000Z")
            }),
            "G-4": makeSprintDoc("G-4", { kind: "epic" })
          }
        },
        { role: "pm" }
      )
    )
  )
)

it.effect("listSprintsPaged filters by state=completed", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const page = yield* groups.listSprintsPaged("completed", undefined, 50)
    expect(page.items.map((g) => g.id)).toEqual(["G-2"])
  }).pipe(
    Effect.provide(
      makeGroupsLayer(
        {
          groups: {
            "G-1": makeSprintDoc("G-1"),
            "G-2": makeSprintDoc("G-2", {
              completedAt: isoDate("2026-04-15T00:00:00.000Z")
            }),
            "G-3": makeSprintDoc("G-3", {
              startsAt: isoDate("2099-01-01T00:00:00.000Z")
            })
          }
        },
        { role: "pm" }
      )
    )
  )
)

it.effect("listSprintsPaged with no state returns all sprints, no epics", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const page = yield* groups.listSprintsPaged(undefined, undefined, 50)
    expect(page.items.map((g) => g.id)).toEqual(["G-1", "G-2"])
  }).pipe(
    Effect.provide(
      makeGroupsLayer(
        {
          groups: {
            "G-1": makeSprintDoc("G-1"),
            "G-2": makeSprintDoc("G-2", {
              completedAt: isoDate("2026-04-15T00:00:00.000Z")
            }),
            "G-3": makeSprintDoc("G-3", { kind: "epic" })
          }
        },
        { role: "pm" }
      )
    )
  )
)

it.effect("removeTicketFromAllGroups strips the id", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({
      name: "G",
      tickets: [ticketId("T-1"), ticketId("T-2")]
    })
    yield* groups.removeTicketFromAllGroups("org", "p", "T-1")
    const after = yield* groups.get(created.id)
    expect(after.tickets).toEqual(["T-2"])
  }).pipe(
    Effect.provide(
      makeGroupsLayer({ ticketIds: ["T-1", "T-2"] }, { role: "developer" })
    )
  )
)

it.effect(
  "addTickets appends novel ticket ids and preserves existing order",
  () =>
    Effect.gen(function* () {
      const groups = yield* Groups
      const created = yield* groups.create({
        name: "Sprint 1",
        kind: "sprint",
        tickets: [ticketId("T-1")]
      })
      const result = yield* groups.addTickets(created.id, [
        ticketId("T-2"),
        ticketId("T-3")
      ])
      expect(result.target.tickets).toEqual(["T-1", "T-2", "T-3"])
      expect(result.evicted).toEqual([])
    }).pipe(
      Effect.provide(
        makeGroupsLayer({ ticketIds: ["T-1", "T-2", "T-3"] }, { role: "pm" })
      )
    )
)

it.effect("addTickets deduplicates against current membership", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({
      name: "Sprint 1",
      kind: "sprint",
      tickets: [ticketId("T-1"), ticketId("T-2")]
    })
    const result = yield* groups.addTickets(created.id, [
      ticketId("T-1"),
      ticketId("T-3")
    ])
    expect(result.target.tickets).toEqual(["T-1", "T-2", "T-3"])
  }).pipe(
    Effect.provide(
      makeGroupsLayer({ ticketIds: ["T-1", "T-2", "T-3"] }, { role: "pm" })
    )
  )
)

it.effect("addTickets deduplicates within the request payload", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({
      name: "Sprint 1",
      kind: "sprint",
      tickets: [ticketId("T-1")]
    })
    const result = yield* groups.addTickets(created.id, [
      ticketId("T-2"),
      ticketId("T-2"),
      ticketId("T-3"),
      ticketId("T-3"),
      ticketId("T-2")
    ])
    expect(result.target.tickets).toEqual(["T-1", "T-2", "T-3"])
  }).pipe(
    Effect.provide(
      makeGroupsLayer({ ticketIds: ["T-1", "T-2", "T-3"] }, { role: "pm" })
    )
  )
)

it.effect(
  "addTickets is a no-op when nothing new is added — no group write happens",
  () => {
    const fakeDocs = makeFakeDocs({ ticketIds: ["T-1", "T-2"] })
    const layer = GroupsLive.pipe(
      Layer.provide(fakeDocs.groupLayer),
      Layer.provide(fakeDocs.ticketLayer),
      Layer.provide(fakeDocs.ticketIndexLayer),
      Layer.provide(TicketDocumentLock.layer),
      Layer.provide(KeyedLock.layer),
      Layer.merge(scopeLayer("pm"))
    )
    return Effect.gen(function* () {
      const groups = yield* Groups
      const created = yield* groups.create({
        name: "Sprint 1",
        kind: "sprint",
        tickets: [ticketId("T-1"), ticketId("T-2")]
      })
      const writesAfterCreate = fakeDocs.state.groupWrites.length
      const result = yield* groups.addTickets(created.id, [
        ticketId("T-1"),
        ticketId("T-2")
      ])
      expect(result.target.tickets).toEqual(["T-1", "T-2"])
      expect(result.evicted).toEqual([])
      expect(fakeDocs.state.groupWrites.length).toBe(writesAfterCreate)
    }).pipe(Effect.provide(layer))
  }
)

it.effect("addTickets evicts overlap from other active sprints", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const sprintA = yield* groups.create({
      name: "Sprint A",
      kind: "sprint",
      tickets: [ticketId("T-1"), ticketId("T-2")]
    })
    const sprintB = yield* groups.create({
      name: "Sprint B",
      kind: "sprint"
    })
    const result = yield* groups.addTickets(sprintB.id, [ticketId("T-2")])
    expect(result.target.tickets).toEqual(["T-2"])
    expect(result.evicted).toEqual([
      { groupId: sprintA.id, ticketIds: ["T-2"] }
    ])
    const a = yield* groups.get(sprintA.id)
    expect(a.tickets).toEqual(["T-1"])
  }).pipe(
    Effect.provide(
      makeGroupsLayer({ ticketIds: ["T-1", "T-2"] }, { role: "pm" })
    )
  )
)

it.effect("addTickets refuses to mutate a completed sprint", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({
      name: "Sprint 1",
      kind: "sprint",
      tickets: [ticketId("T-1")]
    })
    yield* groups.complete(created.id, {
      destination: { kind: "backlog" }
    })
    const outcome = yield* Effect.result(
      groups.addTickets(created.id, [ticketId("T-2")])
    )
    expect(outcome._tag).toBe("Failure")
    if (outcome._tag === "Failure") {
      expect(outcome.failure._tag).toBe("SprintCompletedImmutable")
    }
  }).pipe(
    Effect.provide(
      makeGroupsLayer({ ticketIds: ["T-1", "T-2"] }, { role: "pm" })
    )
  )
)

it.effect("addTickets serializes concurrent calls on the same project", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const sprint = yield* groups.create({
      name: "Sprint 1",
      kind: "sprint",
      tickets: [ticketId("T-1")]
    })
    yield* Effect.all(
      [
        groups.addTickets(sprint.id, [ticketId("T-2")]),
        groups.addTickets(sprint.id, [ticketId("T-3")])
      ],
      { concurrency: "unbounded" }
    )
    const after = yield* groups.get(sprint.id)
    expect([...after.tickets].sort()).toEqual(["T-1", "T-2", "T-3"])
  }).pipe(
    Effect.provide(
      makeGroupsLayer({ ticketIds: ["T-1", "T-2", "T-3"] }, { role: "pm" })
    )
  )
)

it.effect(
  "removeTickets drops ids without replacing the rest of the list",
  () =>
    Effect.gen(function* () {
      const groups = yield* Groups
      const sprint = yield* groups.create({
        name: "Sprint 1",
        kind: "sprint",
        tickets: [ticketId("T-1"), ticketId("T-2"), ticketId("T-3")]
      })
      const result = yield* groups.removeTickets(sprint.id, [ticketId("T-2")])
      expect(result.target.tickets).toEqual(["T-1", "T-3"])
      expect(result.evicted).toEqual([])
    }).pipe(
      Effect.provide(
        makeGroupsLayer({ ticketIds: ["T-1", "T-2", "T-3"] }, { role: "pm" })
      )
    )
)

it.effect("removeTickets is a no-op when none of the ids are members", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const sprint = yield* groups.create({
      name: "Sprint 1",
      kind: "sprint",
      tickets: [ticketId("T-1")]
    })
    const result = yield* groups.removeTickets(sprint.id, [ticketId("T-2")])
    expect(result.target.tickets).toEqual(["T-1"])
    expect(result.evicted).toEqual([])
  }).pipe(
    Effect.provide(
      makeGroupsLayer({ ticketIds: ["T-1", "T-2"] }, { role: "pm" })
    )
  )
)

it.effect("removeTickets serializes with concurrent addTickets", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const sprint = yield* groups.create({
      name: "Sprint 1",
      kind: "sprint",
      tickets: [ticketId("T-1"), ticketId("T-2")]
    })
    yield* Effect.all(
      [
        groups.removeTickets(sprint.id, [ticketId("T-1")]),
        groups.addTickets(sprint.id, [ticketId("T-3")])
      ],
      { concurrency: "unbounded" }
    )
    const after = yield* groups.get(sprint.id)
    expect([...after.tickets].sort()).toEqual(["T-2", "T-3"])
  }).pipe(
    Effect.provide(
      makeGroupsLayer({ ticketIds: ["T-1", "T-2", "T-3"] }, { role: "pm" })
    )
  )
)

it.effect("removeTickets refuses to mutate a completed sprint", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create({
      name: "Sprint 1",
      kind: "sprint",
      tickets: [ticketId("T-1")]
    })
    yield* groups.complete(created.id, {
      destination: { kind: "backlog" }
    })
    const outcome = yield* Effect.result(
      groups.removeTickets(created.id, [ticketId("T-1")])
    )
    expect(outcome._tag).toBe("Failure")
    if (outcome._tag === "Failure") {
      expect(outcome.failure._tag).toBe("SprintCompletedImmutable")
    }
  }).pipe(
    Effect.provide(makeGroupsLayer({ ticketIds: ["T-1"] }, { role: "pm" }))
  )
)

it.effect("setSprintMembership places a ticket at the start", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const sprint = yield* groups.create({
      name: "Sprint 1",
      kind: "sprint",
      tickets: [ticketId("T-1"), ticketId("T-2")]
    })

    yield* groups.setSprintMembership("org", "p", ticketId("T-3"), sprint.id, {
      after: null
    })

    const updated = yield* groups.get(sprint.id)
    expect(updated.tickets).toEqual(["T-3", "T-1", "T-2"])
  }).pipe(
    Effect.provide(
      makeGroupsLayer({ ticketIds: ["T-1", "T-2", "T-3"] }, { role: "pm" })
    )
  )
)

it.effect("lets a client read groups but not create or change them", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const epic = yield* groups
      .create({ name: "Epic", kind: "epic" })
      .pipe(Effect.provideService(ProjectScope, asScope("member", "pm")))
    expect((yield* groups.list()).map((group) => group.id)).toStrictEqual([
      epic.id
    ])
    for (const kind of ["epic", "other", "sprint"] as const) {
      const error = yield* Effect.flip(groups.create({ name: "No", kind }))
      expect(error._tag).toBe("Forbidden")
    }
    const rename = yield* Effect.flip(groups.update(epic.id, { name: "No" }))
    expect(rename._tag).toBe("Forbidden")
  }).pipe(
    Effect.provide(groupsLayer()),
    Effect.provideService(ProjectScope, asScope("guest", "client"))
  )
)

it.effect(
  "lets an org admin without a project role read groups but not plan",
  () =>
    Effect.gen(function* () {
      const groups = yield* Groups
      expect(yield* groups.list()).toStrictEqual([])
      const error = yield* Effect.flip(
        groups.create({ name: "Sprint", kind: "sprint" })
      )
      expect(error._tag).toBe("Forbidden")
    }).pipe(
      Effect.provide(groupsLayer()),
      Effect.provideService(ProjectScope, asScope("admin", null))
    )
)
