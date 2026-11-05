import * as Context from "effect/Context"

import type { ActivitySystemSource } from "../tickets/TicketActivity"

/** @effect-leakable-service */
export class ActivityActor extends Context.Service<
  ActivityActor,
  | Readonly<{ kind: "user"; userId: string }>
  | Readonly<{
      kind: "agent"
      userId: string
      clientId: string
      clientName: string
    }>
  | Readonly<{ kind: "system"; source: ActivitySystemSource }>
>()("@pp/shared/access/ActivityActor") {
  static readonly user = (userId: string): ActivityActor["Service"] => ({
    kind: "user",
    userId
  })
  static readonly agent = (
    userId: string,
    client: Readonly<{ id: string; name: string }>
  ): ActivityActor["Service"] => ({
    kind: "agent",
    userId,
    clientId: client.id,
    clientName: client.name
  })
  static readonly system = (
    source: ActivitySystemSource
  ): ActivityActor["Service"] => ({ kind: "system", source })
}

export const activityActorUserId = (
  actor: ActivityActor["Service"]
): string | null => (actor.kind === "system" ? null : actor.userId)
