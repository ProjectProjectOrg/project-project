import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import * as Effect from "effect/Effect"
import { Org } from "../Services/Org"

export const OrgHandlerLive = HttpApiBuilder.group(AppApi, "org", (handlers) =>
  handlers
    .handle("myOrgs", () =>
      Effect.gen(function* () {
        const user = yield* CurrentUser
        const org = yield* Org
        return yield* org.myOrgs(user.id)
      })
    )
    .handle("get", ({ path }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser
        const org = yield* Org
        return yield* org.get(path.orgSlug, user.id)
      })
    )
    .handle("softDelete", ({ path }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser
        const org = yield* Org
        return yield* org.softDelete(path.orgSlug, user.id)
      })
    )
    .handle("restore", ({ path }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser
        const org = yield* Org
        return yield* org.restore(path.orgSlug, user.id)
      })
    )
)
