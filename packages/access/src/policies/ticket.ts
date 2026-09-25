import type { ProjectActor } from "./actor"

export type Change = Readonly<{
  ownerId: string
  content: boolean
  status: boolean
  assignees: boolean
}>

const canEditContent = (actor: ProjectActor, ownerId: string) =>
  actor.permissions.can({ ticket: ["update"] }) ||
  (actor.userId === ownerId &&
    actor.permissions.can({ ticket: ["update_own"] }))

export const canChange = (actor: ProjectActor, change: Change) =>
  (!change.content || canEditContent(actor, change.ownerId)) &&
  (!change.status || actor.permissions.can({ ticket: ["transition"] })) &&
  (!change.assignees || actor.permissions.can({ ticket: ["assign"] }))
