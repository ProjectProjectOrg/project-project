import type {
  TicketDescription,
  UpdateTicketDescriptionInput
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import type * as Effect from "effect/Effect"

import type { LocalProject } from "./LocalRpcs"
import type { SyncDenied, SyncOffline } from "./SyncSource"

export type SaveOutcome = Data.TaggedEnum<{
  Saved: Readonly<{ description: TicketDescription }>
  Changed: {}
  Pending: {}
  Rejected: Readonly<{ reason: string }>
}>

export const SaveOutcome = Data.taggedEnum<SaveOutcome>()

export class DescriptionSource extends Context.Service<
  DescriptionSource,
  Readonly<{
    fetch: (
      project: LocalProject,
      ids: ReadonlyArray<string>
    ) => Effect.Effect<
      ReadonlyArray<TicketDescription>,
      SyncDenied | SyncOffline
    >
    save: (
      project: LocalProject,
      id: string,
      input: UpdateTicketDescriptionInput,
      operationId: string
    ) => Effect.Effect<SaveOutcome, SyncOffline>
  }>
>()("@pp/local/DescriptionSource") {}
