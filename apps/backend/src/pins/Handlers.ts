import * as SidebarPins from "@pp/server-core/pins/SidebarPins"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

import { dieOnMarkdown } from "../http/dieOnMarkdown"

export const SidebarPinsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "sidebarPins",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.flatMap(SidebarPins.SidebarPins, (pins) => pins.list())
      )
      .handle("pin", ({ payload }) =>
        Effect.flatMap(SidebarPins.SidebarPins, (pins) =>
          pins.pin(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("reorder", ({ params, payload }) =>
        Effect.flatMap(SidebarPins.SidebarPins, (pins) =>
          pins.reorder(params.kind, params.ref, payload.orderKey)
        ).pipe(dieOnMarkdown)
      )
      .handle("unpin", ({ params }) =>
        Effect.flatMap(SidebarPins.SidebarPins, (pins) =>
          pins.unpin(params.kind, params.ref)
        )
      )
)
