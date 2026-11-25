import { createFileRoute } from "@tanstack/react-router"

import { settingsPage } from "@/components/shell/settings/settingsPage"
import { WorkflowSettings } from "@/features/projects/components/settings/WorkflowSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/projects/$slug/workflow"
)({
  component: WorkflowSettings,
  loader: () =>
    settingsPage(
      m.project_settings_workflow_tab(),
      m.project_settings_workflow_description()
    )
})
