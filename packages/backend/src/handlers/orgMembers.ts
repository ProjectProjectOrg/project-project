import { isAPIError } from "better-auth/api"
import * as Effect from "effect/Effect"
import {
  Conflict,
  Forbidden,
  NotFound,
  type OrgRole
} from "@projectproject/shared"
import { BetterAuthError } from "../Services/BetterAuth"

export const collapseRole = (role: string): OrgRole => {
  const roles = role.split(",")
  if (roles.includes("owner")) return "owner"
  if (roles.includes("admin")) return "admin"
  return "member"
}

export const memberErrorToFailure = (
  error: BetterAuthError
): Effect.Effect<never, Forbidden | NotFound | Conflict> => {
  const { cause } = error
  if (!isAPIError(cause) || cause.statusCode < 400 || cause.statusCode >= 500) {
    return Effect.die(error)
  }
  const body = cause.body as { message?: string; code?: string } | undefined
  const reason = body?.message ?? body?.code ?? "request_failed"
  if (cause.statusCode === 403) {
    return Effect.fail(new Forbidden())
  }
  if (cause.statusCode === 404) {
    return Effect.fail(new NotFound())
  }
  if (cause.statusCode === 409) {
    return Effect.fail(new Conflict({ reason }))
  }
  return Effect.fail(new Forbidden())
}
