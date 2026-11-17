import type { TicketId } from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { LocalProject } from "./LocalRpcs"
import type { EditRejected, PendingWrite } from "./pending"
import type { SyncOffline } from "./SyncSource"

export type Sent = Readonly<{ receipt: string; created: TicketId | null }>

export class PendingWrites extends Context.Service<
  PendingWrites,
  Readonly<{
    operationId: Effect.Effect<string>
    send: (
      project: LocalProject,
      operationId: string,
      write: PendingWrite
    ) => Effect.Effect<Sent, EditRejected | SyncOffline>
  }>
>()("@pp/local/pendingWrites") {}
