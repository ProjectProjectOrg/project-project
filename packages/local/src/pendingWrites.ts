import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { LocalProject } from "./LocalRpcs"
import type { EditRejected, PendingWrite } from "./pending"
import type { SyncOffline } from "./SyncSource"

export class PendingWrites extends Context.Service<
  PendingWrites,
  Readonly<{
    operationId: Effect.Effect<string>
    send: (
      project: LocalProject,
      operationId: string,
      write: PendingWrite
    ) => Effect.Effect<string, EditRejected | SyncOffline>
  }>
>()("@pp/local/pendingWrites") {}
