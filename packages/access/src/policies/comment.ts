import type { ProjectActor } from "./actor"

export type Authored = Readonly<{ authorId: string }>

const canTouch = (
  actor: ProjectActor,
  comment: Authored,
  own: "update_own" | "delete_own"
) =>
  actor.permissions.can({ comment: ["moderate"] }) ||
  (actor.userId === comment.authorId &&
    actor.permissions.can({ comment: [own] }))

export const canEdit = (actor: ProjectActor, comment: Authored) =>
  canTouch(actor, comment, "update_own")

export const canDelete = (actor: ProjectActor, comment: Authored) =>
  canTouch(actor, comment, "delete_own")
