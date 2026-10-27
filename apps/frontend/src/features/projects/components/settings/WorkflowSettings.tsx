import { getRouteApi } from "@tanstack/react-router"

import {
  SettingsGroup,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { GitAutomationSettings } from "@/features/github/components/GitAutomationSettings"
import { projectRequest } from "@/features/projects/atoms/projects"
import { EstimationSettings } from "@/features/projects/components/settings/EstimationSettings"
import { useProject } from "@/features/projects/hooks/useProject"
import { StatusList } from "@/features/statuses/components/StatusList"
import { useProjectActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/workflow"
)

export function WorkflowSettings() {
  const { orgSlug } = routeApi.useParams()
  const project = useProject()
  const req = projectRequest(orgSlug, project.slug)
  const actor = useProjectActor()
  const canReadGitAutomation = actor.call("gitAutomation", "get")

  return (
    <>
      <SettingsSection>
        <SettingsGroup>
          <EstimationSettings req={req} estimation={project.estimation} />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title={m.project_settings_workflow_statuses_label()}
        description={m.project_settings_workflow_statuses_description()}
      >
        <StatusList />
      </SettingsSection>

      {canReadGitAutomation ? (
        <GitAutomationSettings
          canEdit={actor.call("gitAutomation", "update")}
        />
      ) : null}
    </>
  )
}
