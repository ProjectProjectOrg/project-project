import { GroupPolicy, TicketPolicy } from "@pp/access/policies"
import type { ProjectActor } from "@pp/shared"

export const ticketPermissions = (actor: ProjectActor) => {
  const edit = TicketPolicy.canChange(actor, { content: true })
  return {
    create: actor.call("tickets", "create"),
    edit,
    assign: TicketPolicy.canChange(actor, { assignees: true }),
    split: edit && actor.call("tickets", "split"),
    move: actor.call("tickets", "move"),
    archive: actor.call("tickets", "archive"),
    delete: actor.call("tickets", "delete"),
    stackBranch: actor.call("tickets", "stackBranch"),
    clearBranch: actor.call("tickets", "clearBranch"),
    planSprints: GroupPolicy.can(actor, "sprint", "manage")
  }
}

export type TicketPermissions = ReturnType<typeof ticketPermissions>
