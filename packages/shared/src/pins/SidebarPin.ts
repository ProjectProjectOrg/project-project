import * as Schema from "effect/Schema"

import { Group, GroupId } from "../groups/Group"
import { Slug } from "../projects/Project"
import { LinkedTicket, TicketId } from "../tickets/Ticket"

export const PinKind = Schema.Literals(["ticket", "sprint"])
export type PinKind = typeof PinKind.Type

export const PinOrderKey = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[A-Za-z][0-9A-Za-z]*$/u)),
  Schema.check(Schema.isMaxLength(128)),
  Schema.brand("PinOrderKey")
).annotate({
  description:
    "A fractional index key; pins sort byte-wise by it within their project."
})
export type PinOrderKey = typeof PinOrderKey.Type

export const PinTarget = Schema.TaggedUnion({
  ticket: { ref: TicketId },
  sprint: { ref: GroupId }
})
export type PinTarget = typeof PinTarget.Type

export const PinnedSprint = Schema.Struct({
  id: Group.fields.id,
  name: Group.fields.name,
  startsAt: Group.fields.startsAt,
  endsAt: Group.fields.endsAt,
  completedAt: Group.fields.completedAt
})
export type PinnedSprint = typeof PinnedSprint.Type

// A pinned ticket: its link, plus the ticket or epic it sits under, so the
// sidebar can show sub-tickets under their parent.
export const PinnedTicket = Schema.Struct({
  ...LinkedTicket.fields,
  parent: Schema.optional(Schema.NullOr(TicketId))
})
export type PinnedTicket = typeof PinnedTicket.Type

export const SidebarPin = Schema.TaggedUnion({
  ticket: {
    projectSlug: Slug,
    ref: TicketId,
    orderKey: PinOrderKey,
    ticket: PinnedTicket
  },
  sprint: {
    projectSlug: Slug,
    ref: GroupId,
    orderKey: PinOrderKey,
    sprint: PinnedSprint
  }
})
export type SidebarPin = typeof SidebarPin.Type

export const ReorderPinInput = Schema.Struct({ orderKey: PinOrderKey })
export type ReorderPinInput = typeof ReorderPinInput.Type
