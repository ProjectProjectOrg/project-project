import type { ProjectActor } from "./actor"

export type Change = Readonly<{
  content: boolean
  status: boolean
  assignees: boolean
}>

type Fields = Readonly<{ status: string; assignees: ReadonlyArray<string> }>

export type Split = Readonly<{
  source: Fields
  retained: Fields
  created: ReadonlyArray<Fields>
  defaultStatus: string
}>

export type Query = Readonly<{ hasBranch?: boolean; hasPr?: boolean }>

export const canChange = (actor: ProjectActor, change: Change) =>
  (!change.content || actor.permissions.can({ ticket: ["update"] })) &&
  (!change.status || actor.permissions.can({ ticket: ["transition"] })) &&
  (!change.assignees || actor.permissions.can({ ticket: ["assign"] }))

const splitChange = (split: Split) => {
  const sourceAssignees = new Set(split.source.assignees)
  const copiesStatus = (result: Fields) =>
    result.status === split.source.status ||
    result.status === split.defaultStatus
  return {
    content: true,
    status:
      split.retained.status !== split.source.status ||
      !split.created.every(copiesStatus),
    assignees:
      split.retained.assignees.length !== sourceAssignees.size ||
      [split.retained, ...split.created].some((result) =>
        result.assignees.some((assignee) => !sourceAssignees.has(assignee))
      )
  }
}

export const canSplit = (actor: ProjectActor, split: Split) =>
  canChange(actor, splitChange(split))

export const canQuery = (actor: ProjectActor, query: Query) =>
  (query.hasBranch === undefined && query.hasPr === undefined) ||
  actor.permissions.can({ github: ["read"] })
