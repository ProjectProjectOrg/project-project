import { useAtomSet } from "@effect/atom-react"
import { ProjectPolicy } from "@pp/access/policies"
import { Button } from "@pp/ui/button"
import { getRouteApi } from "@tanstack/react-router"

import { SettingsGroup } from "@/components/shell/settings/SettingsGroup"
import {
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsTextField } from "@/components/shell/settings/SettingsTextField"
import {
  projectRequest,
  updateProject
} from "@/features/projects/atoms/projects"
import { ProjectAppearanceSection } from "@/features/projects/components/appearance/ProjectAppearanceSection"
import { ProjectDangerZone } from "@/features/projects/components/settings/ProjectDangerZone"
import { useProject } from "@/features/projects/hooks/useProject"
import { useProjectActor } from "@/hooks/useActor"
import { useSave } from "@/hooks/useSave"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi(
  "/_authed/settings/orgs/$orgSlug/projects/$slug/general"
)

export function ProjectGeneralSettings() {
  const { orgSlug } = routeApi.useParams()
  const project = useProject()
  const req = projectRequest(orgSlug, project.slug)
  const update = useAtomSet(updateProject(req), { mode: "promiseExit" })
  const rename = useSave((name: string) => update({ name }))
  const actor = useProjectActor()
  const canEdit = ProjectPolicy.canUpdate(actor, { settings: true })
  const canExport = actor.call("projects", "export")

  return (
    <>
      <ProjectAppearanceSection
        name={project.name}
        projectKey={project.key}
        icon={project.icon}
        iconImage={project.iconImage}
        color={project.color}
        tone={project.tone}
        colors={project.colors}
        banner={project.banner}
        canEdit={canEdit}
      />

      <SettingsSection>
        <SettingsGroup>
          <SettingsRow
            label={m.project_settings_name_label()}
            error={rename.error ? m.project_settings_name_error() : null}
          >
            {canEdit ? (
              <SettingsTextField
                value={project.name}
                onCommit={(name) => void rename.run(name)}
                waiting={rename.waiting}
                maxLength={120}
              />
            ) : (
              <span className="text-body text-muted-foreground">
                {project.name}
              </span>
            )}
          </SettingsRow>
          <SettingsRow
            label={m.project_settings_key_label()}
            description={m.project_settings_key_description()}
          >
            <span className="text-body text-muted-foreground tabular-nums">
              {project.key}
            </span>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>

      {canExport ? (
        <SettingsSection>
          <SettingsGroup>
            <SettingsRow
              label={m.project_settings_export_heading()}
              description={m.project_settings_export_description()}
            >
              <Button
                variant="tertiary"
                size="sm"
                render={
                  <a
                    aria-label={m.project_settings_export_button()}
                    href={`/api/orgs/${orgSlug}/projects/${project.slug}/export`}
                    download
                  />
                }
              >
                {m.project_settings_export_button()}
              </Button>
            </SettingsRow>
          </SettingsGroup>
        </SettingsSection>
      ) : null}
      {actor.call("projects", "delete") ? (
        <ProjectDangerZone
          orgSlug={orgSlug}
          slug={project.slug}
          projectKey={project.key}
        />
      ) : null}
    </>
  )
}
