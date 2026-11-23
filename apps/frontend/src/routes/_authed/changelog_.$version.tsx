import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { ReleasePage } from "@/features/instance/components/ChangelogPage"
import { displayVersion } from "@/features/instance/lib/displayVersion"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/changelog_/$version")({
  component: RouteComponent,
  loader: ({ params }) => ({
    crumb: [
      Crumb.static({ label: m.chrome_whats_new_title(), to: "/changelog" }),
      Crumb.static({ label: displayVersion(params.version) })
    ]
  })
})

function RouteComponent() {
  const { version } = Route.useParams()
  return <ReleasePage key={version} version={version} />
}
