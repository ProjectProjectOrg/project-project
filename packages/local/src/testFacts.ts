import type {
  ProjectChanges,
  ProjectSnapshot,
  SnapshotPage,
  TicketFact
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { localDescriptionsLayer } from "./descriptions"
import { DescriptionSource, SaveOutcome } from "./DescriptionSource"
import { beginStaging, publishStaging } from "./store"

const at = DateTime.toDateUtc(DateTime.makeUnsafe("2026-11-16T10:00:00Z"))

export const ticket = (id: string, title: string): TicketFact => ({
  id,
  title,
  status: "todo",
  type: null,
  priority: "med",
  rank: id,
  estimate: null,
  tags: [],
  assignees: [],
  parent: null,
  relations: [],
  flag: null,
  git: null,
  archivedAt: null,
  createdBy: "user-1",
  createdAt: at,
  updatedAt: at,
  descriptionRevision: "0.0"
})

const project = {
  id: "project-1",
  key: "T",
  name: "Test",
  icon: "folder",
  color: "blue",
  estimation: "off"
} as const

export const snapshot = (
  cursor: string,
  tickets: ReadonlyArray<TicketFact>
): ProjectSnapshot => ({
  kind: "snapshot",
  cursor,
  project,
  tickets,
  groups: [],
  statuses: [],
  tags: [{ name: "bug", color: "red" }],
  members: []
})

export const changes = (
  cursor: string,
  upserts: ReadonlyArray<TicketFact>,
  deletes: ReadonlyArray<string>
): ProjectChanges => ({
  kind: "changes",
  cursor,
  project: null,
  upserts: {
    tickets: upserts,
    groups: [],
    statuses: [],
    tags: [],
    members: []
  },
  deletes: {
    tickets: deletes,
    groups: [],
    statuses: [],
    tags: [],
    members: []
  },
  comments: [],
  git: false,
  more: false
})

export const pageOf = (full: ProjectSnapshot): SnapshotPage => ({
  kind: "snapshot",
  base: full.cursor,
  git: false,
  start: {
    project: full.project,
    groups: full.groups.map(({ tickets: _tickets, ...header }) => header),
    statuses: full.statuses,
    tags: full.tags,
    members: full.members,
    ticketCount: full.tickets.length
  },
  tickets: full.tickets,
  groupMembers: full.groups.flatMap((group) =>
    group.tickets.map((ticket, position) => ({
      group: group.id,
      ticket,
      position
    }))
  ),
  next: null
})

export const onePage = (
  base: string,
  tickets: ReadonlyArray<TicketFact>
): SnapshotPage => pageOf(snapshot(base, tickets))

export const direct = <A, E, R>(transaction: Effect.Effect<A, E, R>) =>
  transaction

export const directly = {
  write: direct,
  readsWaiting: Effect.succeed(false)
}

export const install = (scope: string, full: ProjectSnapshot) =>
  Effect.andThen(
    beginStaging(scope, pageOf(full), directly),
    publishStaging(scope, directly)
  )

export const noDescriptions = localDescriptionsLayer.pipe(
  Layer.provide(
    Layer.succeed(DescriptionSource, {
      fetch: () => Effect.succeed([]),
      page: () => Effect.succeed({ descriptions: [], groups: [], next: null }),
      group: () => Effect.succeed(null),
      save: () => Effect.succeed(SaveOutcome.Rejected({ reason: "test" }))
    })
  )
)
