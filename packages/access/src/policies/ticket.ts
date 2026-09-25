import type { ProjectActor } from "./actor"

export type Change = Readonly<{
  ownerId: string
  content: boolean
  status: boolean
  assignees: boolean
}>

type Fields = Readonly<{ status: string; assignees: ReadonlyArray<string> }>

export type Split = Readonly<{
  ownerId: string
  source: Fields
  retained: Fields
  created: ReadonlyArray<Fields>
  defaultStatus: string
  detachesGit: boolean
}>

export type Query = Readonly<{ hasBranch?: boolean; hasPr?: boolean }>

const canEditContent = (actor: ProjectActor, ownerId: string) =>
  actor.permissions.can({ ticket: ["update"] }) ||
  (actor.userId === ownerId &&
    actor.permissions.can({ ticket: ["update_own"] }))

export const canChange = (actor: ProjectActor, change: Change) =>
  (!change.content || canEditContent(actor, change.ownerId)) &&
  (!change.status || actor.permissions.can({ ticket: ["transition"] })) &&
  (!change.assignees || actor.permissions.can({ ticket: ["assign"] }))

const splitChange = (split: Split) => {
  const sourceAssignees = new Set(split.source.assignees)
  return {
    ownerId: split.ownerId,
    content: true,
    status:
      split.retained.status !== split.source.status ||
      split.created.some((result) => result.status !== split.defaultStatus),
    assignees:
      split.retained.assignees.length !== sourceAssignees.size ||
      split.retained.assignees.some(
        (assignee) => !sourceAssignees.has(assignee)
      ) ||
      split.created.some((result) => result.assignees.length > 0)
  }
}

export const canSplit = (actor: ProjectActor, split: Split) =>
  canChange(actor, splitChange(split)) &&
  (!split.detachesGit || actor.permissions.can({ github: ["write"] }))

export const canQuery = (actor: ProjectActor, query: Query) =>
  (query.hasBranch === undefined && query.hasPr === undefined) ||
  actor.permissions.can({ github: ["read"] })
