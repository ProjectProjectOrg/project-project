// packages/backend/src/mcp/handlers.ts
//
// Effect programs that back each entry in the shared `McpTools` catalog. The
// dispatcher walks the catalog and the handler map together — keys must match
// exactly. Today only `me` is wired; Plan 2 adds the rest.
//
// The `R` channel of every handler must fit under the union declared in the
// `HandlersMap<...>` export below — that union feeds into Task 10's
// `ManagedRuntime` and Task 11's route wiring.

import * as Effect from "effect/Effect"
import { CurrentUser, Unauthorized, type MeOutput } from "@projectproject/shared"
import { Users } from "../Services/Users"
import { BetterAuth, type BetterAuthError } from "../Services/BetterAuth"
import type { HandlersMap } from "./dispatch"

const me = (
  _input: {}
): Effect.Effect<
  MeOutput,
  Unauthorized | BetterAuthError,
  CurrentUser | Users | BetterAuth
> =>
  Effect.gen(function* () {
    const current = yield* CurrentUser
    const users = yield* Users
    const [user] = yield* users.fullByIds([current.id])
    if (!user) {
      // CurrentUser is set by middleware so this shouldn't happen; defend
      // anyway so we surface a tagged failure instead of an unhandled defect.
      return yield* new Unauthorized()
    }

    const betterAuth = yield* BetterAuth
    const orgs = yield* betterAuth.listOrganizations(current.id)

    return {
      user,
      roles: orgs.map((o) => ({ orgSlug: o.orgSlug, role: o.role })),
    }
  })

export const handlers: HandlersMap<CurrentUser | Users | BetterAuth> = { me }
