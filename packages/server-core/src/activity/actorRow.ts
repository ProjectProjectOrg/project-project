import type { ticketActivity, TicketActivityOutboxRow } from "@pp/db/schema"
import {
  ActivityActor,
  type ImportedAuthor,
  type TicketActivityActor,
  type User
} from "@pp/shared"

export type WrittenActorColumns = Readonly<
  Pick<
    TicketActivityOutboxRow,
    | "actorKind"
    | "actorUserId"
    | "actorClientId"
    | "actorClientName"
    | "actorSource"
  >
>

export type ActorColumns = Readonly<
  Pick<
    typeof ticketActivity.$inferSelect,
    | "actorKind"
    | "actorUserId"
    | "actorClientId"
    | "actorClientName"
    | "actorSource"
    | "importedName"
    | "importedSource"
    | "importedId"
  >
>

export type StoredActor = ActivityActor["Service"] | ImportedAuthor

export const actorColumns = (actor: ActivityActor["Service"]) => {
  if (actor.kind === "system") {
    return {
      actorKind: "system",
      actorUserId: null,
      actorClientId: null,
      actorClientName: null,
      actorSource: actor.source
    } satisfies WrittenActorColumns
  }
  return {
    actorKind: actor.kind,
    actorUserId: actor.userId,
    actorClientId: actor.kind === "agent" ? actor.clientId : null,
    actorClientName: actor.kind === "agent" ? actor.clientName : null,
    actorSource: null
  } satisfies WrittenActorColumns
}

export const actorOf = (row: ActorColumns) => {
  if (row.actorKind === "imported") {
    return {
      kind: "imported",
      displayName: row.importedName ?? "",
      source: row.importedSource ?? "projectproject",
      sourceId: row.importedId ?? ""
    } satisfies StoredActor
  }
  if (row.actorKind === "agent") {
    return ActivityActor.agent(row.actorUserId ?? "", {
      id: row.actorClientId ?? "",
      name: row.actorClientName ?? ""
    })
  }
  if (row.actorKind === "user") return ActivityActor.user(row.actorUserId ?? "")
  return ActivityActor.system(row.actorSource ?? "automation")
}

export const storedActorUserId = (actor: StoredActor) =>
  actor.kind === "system" || actor.kind === "imported" ? null : actor.userId

export const presentActor = (
  actor: StoredActor,
  users: ReadonlyMap<string, User>
) => {
  if (actor.kind === "system" || actor.kind === "imported") return actor
  const user = users.get(actor.userId)
  if (user === undefined) return null
  return actor.kind === "user"
    ? ({ kind: "user", user } satisfies TicketActivityActor)
    : ({
        kind: "agent",
        user,
        client: { id: actor.clientId, name: actor.clientName }
      } satisfies TicketActivityActor)
}
