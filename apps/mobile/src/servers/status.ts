import * as Effect from "effect/Effect"
import * as Match from "effect/Match"

import { type CheckedServer, checkServer } from "@/onboarding/checkServer"

import type { SavedServer } from "./model"

export type ServerStatus =
  | "connected"
  | "signed_out"
  | "unreachable"
  | "moved"
  | "not_configured"
  | "server_outdated"
  | "app_outdated"

export const statusOf = (
  server: SavedServer,
  checked: CheckedServer,
  signedIn: boolean
): ServerStatus => {
  if (checked.descriptor.instanceId !== server.instanceId) return "moved"
  return signedIn ? "connected" : "signed_out"
}

export const serverStatus = (server: SavedServer, signedIn: boolean) =>
  checkServer(server.origin).pipe(
    Effect.map((checked) => statusOf(server, checked, signedIn)),
    Effect.catchTag("ServerCheckFailed", (failure) =>
      Effect.succeed(
        Match.value(failure.problem).pipe(
          Match.when("server_outdated", (): ServerStatus => "server_outdated"),
          Match.when("app_outdated", (): ServerStatus => "app_outdated"),
          Match.when("not_configured", (): ServerStatus => "not_configured"),
          Match.orElse((): ServerStatus => "unreachable")
        )
      )
    )
  )
