import { createFileRoute } from "@tanstack/react-router"

import { WorkflowSettings } from "@/features/projects/components/settings/WorkflowSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/workflow"
)({
  component: WorkflowSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.project_settings_workflow_tab() }
  })
})
