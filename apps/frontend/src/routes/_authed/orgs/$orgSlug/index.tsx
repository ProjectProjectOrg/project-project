import { createFileRoute } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { Dashboard } from "@/features/dashboard/components/Dashboard"
import { preloadDashboard } from "@/features/dashboard/lib/preloadDashboard"

const DashboardSearchSchema = Schema.Struct({
  view: Schema.optional(Schema.Literals(["list", "board"]))
})

export const Route = createFileRoute("/_authed/orgs/$orgSlug/")({
  component: Dashboard,
  validateSearch: Schema.toStandardSchemaV1(DashboardSearchSchema),
  loader: async ({
    context: { registry },
    params: { orgSlug },
    abortController
  }) => {
    await Effect.runPromiseExit(preloadDashboard(registry, orgSlug), {
      signal: abortController.signal
    })
    return {
      crumb: { type: "static" as const, label: "Dashboard", to: "/" }
    }
  }
})
