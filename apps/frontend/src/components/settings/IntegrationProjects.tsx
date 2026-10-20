import { useAtomValue } from "@effect/atom-react"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { ProjectIconDisplay } from "@/components/ProjectIconDisplay"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { m } from "@/paraglide/messages"

export function IntegrationProjects({
  orgSlug
}: Readonly<{ orgSlug: string }>) {
  const result = useAtomValue(projectsFor(projectsRequest(orgSlug)))
  if (!Result.isSuccess(result) || result.value.length === 0) return null
  return (
    <SettingsSection
      title={m.org_integrations_projects_title()}
      description={m.org_integrations_projects_description()}
    >
      <SettingsGroup>
        {result.value.map((project) => (
          <SettingsRow
            key={project.slug}
            icon={
              <ProjectIconDisplay
                orgSlug={orgSlug}
                icon={project.icon}
                iconImage={project.iconImage}
                size={20}
              />
            }
            label={project.name}
          >
            <Button
              variant="tertiary"
              size="sm"
              render={
                <Link
                  to="/orgs/$orgSlug/projects/$slug/settings/integrations"
                  params={{ orgSlug, slug: project.slug }}
                />
              }
            >
              {m.org_integrations_open_project_button()}
            </Button>
          </SettingsRow>
        ))}
      </SettingsGroup>
    </SettingsSection>
  )
}
