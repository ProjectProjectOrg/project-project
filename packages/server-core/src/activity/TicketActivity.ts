import type {
  ActivityActor,
  ActivityActorShape,
  ActivityCause,
  TicketActivityChange
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { TicketScopedChange } from "./changes"

export type ActivityDocument = Readonly<{
  kind: "ticket" | "group"
  id: string
  content: string | null
}>

export type StoredTicketActivity = Readonly<{
  id: string
  seq: number
  occurredAt: Date
  actor: ActivityActorShape
  cause: ActivityCause | null
  change: TicketActivityChange
}>

export type ActivityPageCursor = Readonly<{ occurredAt: Date; seq: number }>

export interface TicketActivityShape {
  readonly record: <A, E, R>(
    orgSlug: string,
    slug: string,
    document: ActivityDocument,
    changes: ReadonlyArray<TicketScopedChange>,
    cause: ActivityCause | null,
    write: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R | ActivityActor>
  readonly recover: () => Effect.Effect<void>
  readonly removeTicket: (
    orgSlug: string,
    slug: string,
    ticketId: string
  ) => Effect.Effect<void>
  readonly page: (
    projectId: string,
    ticketId: string,
    before: ActivityPageCursor | null,
    limit: number
  ) => Effect.Effect<ReadonlyArray<StoredTicketActivity>>
}

export class TicketActivity extends Context.Service<
  TicketActivity,
  TicketActivityShape
>()("@pp/server-core/activity/TicketActivity") {}
