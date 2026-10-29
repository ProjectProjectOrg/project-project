import type { TicketActivityOutboxRow } from "@pp/db/schema"
import {
  ActivityActor,
  type ActivityActorShape,
  type TicketActivityActor,
  type User
} from "@pp/shared"

export type ActorColumns = Readonly<
  Pick<
    TicketActivityOutboxRow,
    | "actorKind"
    | "actorUserId"
    | "actorClientId"
    | "actorClientName"
    | "actorSource"
  >
>

export const actorColumns = (actor: ActivityActorShape): ActorColumns => {
  if (actor.kind === "system") {
    return {
      actorKind: "system",
      actorUserId: null,
      actorClientId: null,
      actorClientName: null,
      actorSource: actor.source
    }
  }
  return {
    actorKind: actor.kind,
    actorUserId: actor.userId,
    actorClientId: actor.kind === "agent" ? actor.clientId : null,
    actorClientName: actor.kind === "agent" ? actor.clientName : null,
    actorSource: null
  }
}

export const actorOf = (row: ActorColumns): ActivityActorShape => {
  if (row.actorKind === "agent") {
    return ActivityActor.agent(row.actorUserId ?? "", {
      id: row.actorClientId ?? "",
      name: row.actorClientName ?? ""
    })
  }
  if (row.actorKind === "user") return ActivityActor.user(row.actorUserId ?? "")
  return ActivityActor.system(row.actorSource ?? "automation")
}

export const presentActor = (
  actor: ActivityActorShape,
  users: ReadonlyMap<string, User>
): TicketActivityActor | null => {
  if (actor.kind === "system") return actor
  const user = users.get(actor.userId)
  if (user === undefined) return null
  return actor.kind === "user"
    ? { kind: "user", user }
    : {
        kind: "agent",
        user,
        client: { id: actor.clientId, name: actor.clientName }
      }
}
