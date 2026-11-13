import * as Schema from "effect/Schema"

import { User } from "../auth/User"

export const TicketSubscribers = Schema.Struct({
  subscribed: Schema.Boolean,
  subscribers: Schema.Array(User)
})
export type TicketSubscribers = typeof TicketSubscribers.Type
