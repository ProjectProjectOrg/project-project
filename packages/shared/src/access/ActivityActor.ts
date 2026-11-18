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
  static readonly user = (userId: string) =>
    ({ kind: "user", userId }) satisfies ActivityActor["Service"]
  static readonly agent = (
    userId: string,
    client: Readonly<{ id: string; name: string }>
  ) =>
    ({
      kind: "agent",
      userId,
      clientId: client.id,
      clientName: client.name
    }) satisfies ActivityActor["Service"]
  static readonly system = (source: ActivitySystemSource) =>
    ({ kind: "system", source }) satisfies ActivityActor["Service"]
}

export const activityActorUserId = (actor: ActivityActor["Service"]) =>
  actor.kind === "system" ? null : actor.userId
