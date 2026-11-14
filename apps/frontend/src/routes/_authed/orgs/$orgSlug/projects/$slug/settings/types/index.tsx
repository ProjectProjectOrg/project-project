import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import { projectScope } from "@/features/library/atoms/libraryScope"
import { TicketTypesPage } from "@/features/library/components/TicketTypesPage"

const LibrarySearch = Schema.Struct({
  tab: Schema.optional(Schema.Literals(["types", "sections"]))
})

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/types/"
)({
  component: TicketTypesSettings,
  validateSearch: Schema.toStandardSchemaV1(LibrarySearch)
})

function TicketTypesSettings() {
  const params = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <TicketTypesPage
      scope={projectScope(params.orgSlug, params.slug)}
      tab={tab ?? "types"}
      onTabChange={(next) =>
        void navigate({
          search: next === "types" ? {} : { tab: next },
          replace: true
        })
      }
    />
  )
}
