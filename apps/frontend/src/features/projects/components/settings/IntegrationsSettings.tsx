import { useAtomSet } from "@effect/atom-react"
import { getRouteApi } from "@tanstack/react-router"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import { EverhourSettingsRow } from "@/features/everhour/components/EverhourProjectSettings"
import { FigmaProjectSettings } from "@/features/figma/components/FigmaProjectSettings"
import { GithubSettingsRows } from "@/features/github/components/GithubSettingsRows"
import { IntegrationLogo } from "@/features/integrations/components/IntegrationLogo"
import {
  projectRequest,
  updateProjectSetup
} from "@/features/projects/atoms/projects"
import { useProject } from "@/features/projects/hooks/useProject"
import {
  SlackProjectEvents,
  SlackProjectRow
} from "@/features/slack/components/ProjectSettings"
import { useProjectActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/integrations"
)

export function IntegrationsSettings() {
  const { orgSlug } = routeApi.useParams()
  const project = useProject()
  const req = projectRequest(orgSlug, project.slug)
  const update = useAtomSet(updateProjectSetup(req))
  const actor = useProjectActor()

  const canManageSlack = actor.call("slack", "saveProject")

  return (
    <>
      <SettingsSection>
        <SettingsGroup>
          {actor.call("projects", "gitStates") ? (
            <GithubSettingsRows github={project.github} />
          ) : (
            <SettingsRow
              icon={<IntegrationLogo kind="github" />}
              label={m.project_settings_github_heading()}
              description={
                project.github
                  ? `${project.github.repoOwner}/${project.github.repoName}`
                  : m.project_settings_github_not_connected()
              }
            />
          )}
          {project.setup.connectGithubDismissedAt &&
          actor.call("projects", "updateSetup") ? (
            <SettingsRow label={m.project_setup_github_dismissed_note()}>
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => update({ connectGithubDismissedAt: null })}
              >
                {m.project_setup_restore_button()}
              </Button>
            </SettingsRow>
          ) : null}
          {actor.call("everhour", "projectStatus") && (
            <EverhourSettingsRow
              canManage={actor.call("everhour", "connectProject")}
            />
          )}
          <FigmaProjectSettings
            canManage={actor.call("figma", "connectProject")}
          />
          <SlackProjectRow canManage={canManageSlack} />
        </SettingsGroup>
      </SettingsSection>
      <SlackProjectEvents canManage={canManageSlack} />
    </>
  )
}
