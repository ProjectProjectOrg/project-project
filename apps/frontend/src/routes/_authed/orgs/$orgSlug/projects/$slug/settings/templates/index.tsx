import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import { LibraryPage } from "@/components/Library/LibraryPage"
import { projectScope } from "@/components/Library/libraryScope"
import { m } from "@/paraglide/messages"

const LibrarySearch = Schema.Struct({
  tab: Schema.optional(Schema.Literals(["templates", "blocks"]))
})

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/templates/"
)({
  component: ProjectTemplatesSettings,
  validateSearch: Schema.toStandardSchemaV1(LibrarySearch),
  loader: () => ({
    crumb: {
      type: "static" as const,
      label: m.project_settings_templates_tab()
    }
  })
})

function ProjectTemplatesSettings() {
  const { orgSlug, slug } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <LibraryPage
      scope={projectScope(orgSlug, slug)}
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
