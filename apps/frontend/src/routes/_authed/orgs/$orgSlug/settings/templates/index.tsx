import { createFileRoute, redirect } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

const TemplatesSearch = Schema.Struct({
  tab: Schema.optional(Schema.Literals(["templates", "blocks"]))
})

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/templates/"
)({
  validateSearch: Schema.toStandardSchemaV1(TemplatesSearch),
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/orgs/$orgSlug/settings/types",
      params,
      search: search.tab === "blocks" ? { tab: "sections" } : {},
      replace: true
    })
  }
})
