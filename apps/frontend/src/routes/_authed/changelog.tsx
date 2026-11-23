import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { ChangelogPage } from "@/features/instance/components/ChangelogPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/changelog")({
  component: ChangelogPage,
  loader: () => ({
    crumb: Crumb.static({ label: m.chrome_whats_new_title() })
  })
})
