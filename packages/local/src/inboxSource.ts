import {
  type PrivateSync,
  type ProjectSyncQuery,
  Slug,
  TicketId
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import type * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import type { SyncDenied, SyncOffline } from "./SyncSource"

export const InboxMark = Schema.Union([
  Schema.Struct({
    kind: Schema.Literals(["read", "unread", "done"]),
    orgSlug: Slug,
    projectSlug: Slug,
    ticketId: TicketId
  }),
  Schema.Struct({
    kind: Schema.Literals(["readAll", "doneAll"]),
    orgSlug: Slug
  })
])
export type InboxMark = typeof InboxMark.Type

export type InboxPosition = Readonly<{ generation: number; sequence: number }>

export class InboxRejected extends Data.TaggedError("InboxRejected") {}

export class InboxSource extends Context.Service<
  InboxSource,
  Readonly<{
    pull: (
      query: ProjectSyncQuery
    ) => Effect.Effect<PrivateSync, SyncDenied | SyncOffline>
    mark: (
      operationId: string,
      mark: InboxMark
    ) => Effect.Effect<InboxPosition | null, InboxRejected | SyncOffline>
  }>
>()("@pp/local/inboxSource") {}

export const privateReceipt = (header: string | undefined) => {
  const part = header?.split("~").find((entry) => entry.startsWith("private."))
  const [, generation, sequence] = (part ?? "").split(".").map(Number)
  return generation !== undefined &&
    sequence !== undefined &&
    Number.isSafeInteger(generation) &&
    Number.isSafeInteger(sequence)
    ? ({ generation, sequence } satisfies InboxPosition)
    : null
}
