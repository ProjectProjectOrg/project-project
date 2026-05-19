import { createFileRoute, notFound, Outlet } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { ApiClient } from "@/services/ApiClient"
import { AppLayer } from "@/runtime"

export const Route = createFileRoute("/_authed/orgs/$orgSlug")({
  component: OrgLayout,
  loader: async ({ params }) => {
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const client = yield* ApiClient
        yield* client.projects.list({ path: { orgSlug: params.orgSlug } })
      }).pipe(Effect.provide(AppLayer))
    )

    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause)
      if (Option.isSome(failure) && failure.value._tag === "NotFound") {
        throw notFound()
      }
      throw Cause.squash(exit.cause)
    }
  },
})

function OrgLayout() {
  return <Outlet />
}
