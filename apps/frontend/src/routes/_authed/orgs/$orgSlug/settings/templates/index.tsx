import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import { LibraryPage } from "@/components/Library/LibraryPage"
import { orgScope } from "@/components/Library/libraryScope"
import { m } from "@/paraglide/messages"

const LibrarySearch = Schema.Struct({
  tab: Schema.optional(Schema.Literals(["templates", "blocks"]))
})

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/templates/"
)({
  component: OrgTemplatesSettings,
  validateSearch: Schema.toStandardSchemaV1(LibrarySearch),
  loader: () => ({
    crumb: { type: "static" as const, label: m.org_settings_templates_tab() }
  })
})

function OrgTemplatesSettings() {
  const { orgSlug } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <LibraryPage
      scope={orgScope(orgSlug)}
      tab={tab ?? "templates"}
      onTabChange={(next) =>
        void navigate({
          search: next === "templates" ? {} : { tab: next },
          replace: true
        })
      }
    />
  )
}
