import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import * as TicketActivity from "./TicketActivity"

export const TicketActivityRecoveryLive = Layer.effectDiscard(
  Effect.flatMap(TicketActivity.TicketActivity, (activity) =>
    activity.recover()
  )
)
