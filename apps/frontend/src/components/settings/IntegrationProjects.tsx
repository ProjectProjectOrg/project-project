import { useAtomValue } from "@effect/atom-react"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"

import { ErrorPage } from "@/components/ErrorPage"
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
  return Result.matchWithError(result, {
    onInitial: () => null,
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value: projects }) =>
      projects.length === 0 ? null : (
        <SettingsSection
          title={m.org_integrations_projects_title()}
          description={m.org_integrations_projects_description()}
        >
          <SettingsGroup>
            {projects.map((project) => (
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
  })
}
