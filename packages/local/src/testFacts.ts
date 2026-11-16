import type { ProjectSync, TicketFact } from "@pp/shared"
import * as DateTime from "effect/DateTime"

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
  updatedAt: at
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
): Extract<ProjectSync, { kind: "snapshot" }> => ({
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
): Extract<ProjectSync, { kind: "changes" }> => ({
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
  comments: []
})
