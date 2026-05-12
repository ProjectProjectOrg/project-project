import { createFileRoute, Link, notFound, Outlet } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { ApiClient } from "@/services/ApiClient"
import { AppLayer } from "@/runtime"
import { m } from "@/paraglide/messages"

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
  notFoundComponent: OrgNotFound
})

function OrgLayout() {
  return <Outlet />
}

function OrgNotFound() {
  return (
    <div className="grid min-h-full place-items-center px-6 py-16">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="font-mono text-xs text-muted-foreground">
          {m.common_not_found_code()}
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {m.common_not_found_title()}
          </h1>
          <p className="text-sm text-muted-foreground">
            {m.common_not_found_body()}
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent active:scale-[0.97]"
        >
          {m.common_not_found_home_link()}
        </Link>
      </div>
    </div>
  )
}
