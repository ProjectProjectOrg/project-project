import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import { expect, it } from "vitest"

import { parseSearch, stringifySearch } from "@/lib/searchParams"

import { JiraImportSearch } from "./search"

it("loads and navigates reconfiguration URLs without changing their scalar types", async () => {
  const root = createRootRoute()
  const route = createRoute({
    getParentRoute: () => root,
    path: "/orgs/$orgSlug/migrations/jira/$migrationId",
    validateSearch: Schema.toStandardSchemaV1(JiraImportSearch)
  })
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({
      initialEntries: [
        "/orgs/org/migrations/jira/import-1?step=setup&reconfigure=true"
      ]
    }),
    parseSearch,
    stringifySearch
  })
  await router.load()
  expect(router.state.matches.at(-1)?.status).toBe("success")
  expect(router.state.matches.at(-1)?.search).toEqual({
    step: "setup",
    reconfigure: "true"
  })
  const location = router.buildLocation({
    to: "/orgs/$orgSlug/migrations/jira/$migrationId",
    params: { orgSlug: "org", migrationId: "import-1" },
    search: { step: "review", reconfigure: "true" }
  })
  expect(location.href).toBe(
    "/orgs/org/migrations/jira/import-1?step=review&reconfigure=true"
  )
  await router.navigate({ href: location.href })
  await router.load()
  expect(router.state.matches.at(-1)?.status).toBe("success")
  expect(router.state.matches.at(-1)?.search).toEqual({
    step: "review",
    reconfigure: "true"
  })
})
