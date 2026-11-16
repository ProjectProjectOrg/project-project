import * as Schema from "effect/Schema"

import { InboxItem } from "../inbox/InboxItem"
import { Slug } from "../projects/Project"
import { TicketId } from "../tickets/Ticket"
import { SyncCursor } from "./ProjectSync"

export const PrivateFact = Schema.Struct({
  id: Schema.String,
  orgSlug: Slug,
  projectSlug: Slug,
  ticketId: TicketId,
  subscribed: Schema.NullOr(Schema.Boolean),
  inbox: Schema.NullOr(Schema.Struct({ done: Schema.Boolean, item: InboxItem }))
}).annotate({
  description:
    "What the signed-in user alone knows about one ticket: their inbox row and their own subscription. `id` is `<projectId>/<ticketId>`."
})
export type PrivateFact = typeof PrivateFact.Type

export const PrivateSnapshotPage = Schema.Struct({
  kind: Schema.Literal("snapshot"),
  base: SyncCursor,
  first: Schema.Boolean,
  facts: Schema.Array(PrivateFact),
  next: Schema.NullOr(Schema.String)
}).annotate({
  description:
    "One page of a user's private facts. A `first` page begins a new snapshot at log position `base`; follow `next` to the end, then catch up with `after=base`."
})
export type PrivateSnapshotPage = typeof PrivateSnapshotPage.Type

export const PrivateChanges = Schema.Struct({
  kind: Schema.Literal("changes"),
  cursor: SyncCursor,
  upserts: Schema.Array(PrivateFact),
  deletes: Schema.Array(Schema.String),
  more: Schema.Boolean
}).annotate({
  description:
    "Private facts named by log entries after the request's cursor, read as they are now. With `more`, ask again with `after=cursor`."
})
export type PrivateChanges = typeof PrivateChanges.Type

export const PrivateSync = Schema.Union([PrivateSnapshotPage, PrivateChanges])
export type PrivateSync = typeof PrivateSync.Type

export const PrivateSyncPath = Schema.Struct({ userId: Schema.String })
