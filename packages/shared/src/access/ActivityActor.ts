import * as Context from "effect/Context"

import type { ActivitySystemSource } from "../schemas/TicketActivity"

export type ActivityActorShape =
  | Readonly<{ kind: "user"; userId: string }>
  | Readonly<{
      kind: "agent"
      userId: string
      clientId: string
      clientName: string
    }>
  | Readonly<{ kind: "system"; source: ActivitySystemSource }>

/** @effect-leakable-service */
export class ActivityActor extends Context.Service<
  ActivityActor,
  ActivityActorShape
>()("@pp/shared/access/ActivityActor") {
  static readonly user = (userId: string): ActivityActorShape => ({
    kind: "user",
    userId
  })
  static readonly agent = (
    userId: string,
    client: Readonly<{ id: string; name: string }>
  ): ActivityActorShape => ({
    kind: "agent",
    userId,
    clientId: client.id,
    clientName: client.name
  })
  static readonly system = (
    source: ActivitySystemSource
  ): ActivityActorShape => ({ kind: "system", source })
}

export const activityActorUserId = (
  actor: ActivityActorShape
): string | null => (actor.kind === "system" ? null : actor.userId)
