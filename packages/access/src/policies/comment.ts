import type { PolicyActor } from "./actor"

export type Authored = Readonly<{ authorId: string }>

const canTouch = (
  actor: PolicyActor,
  comment: Authored,
  own: "update_own" | "delete_own"
) =>
  actor.permissions.can({ comment: ["moderate"] }) ||
  (actor.userId === comment.authorId &&
    actor.permissions.can({ comment: [own] }))

export const canEdit = (actor: PolicyActor, comment: Authored) =>
  canTouch(actor, comment, "update_own")

export const canDelete = (actor: PolicyActor, comment: Authored) =>
  canTouch(actor, comment, "delete_own")
