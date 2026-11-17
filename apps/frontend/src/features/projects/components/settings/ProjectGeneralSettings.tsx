import { useAtomSet } from "@effect/atom-react"
import { ProjectPolicy } from "@pp/access/policies"
import { getRouteApi } from "@tanstack/react-router"
import { useState } from "react"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsTextField } from "@/components/shell/settings/SettingsTextField"
import { Button } from "@/components/ui/button"
import {
  LexicalEditor,
  type SaveStatus
} from "@/features/editor/components/LexicalEditor"
import { Markdown } from "@/features/editor/components/Markdown"
import { MarkdownSaveIndicator } from "@/features/editor/components/MarkdownSaveIndicator"
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
  "/_authed/orgs/$orgSlug/projects/$slug/settings/general"
)

export function ProjectGeneralSettings() {
  const { orgSlug } = routeApi.useParams()
  const project = useProject()
  const req = projectRequest(orgSlug, project.slug)
  const update = useAtomSet(updateProject(req), { mode: "promiseExit" })
  const rename = useSave((name: string) => update({ name }))
  const actor = useProjectActor()
  const canEdit = ProjectPolicy.canUpdate(actor, { settings: true })
  const canEditBody = ProjectPolicy.canUpdate(actor, { body: true })
  const canExport = actor.call("projects", "export")
  const [status, setStatus] = useState<SaveStatus>("idle")

  return (
    <>
      <ProjectAppearanceSection
        name={project.name}
        projectKey={project.key}
        icon={project.icon}
        iconImage={project.iconImage}
        color={project.color}
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
            <span className="font-mono text-body text-muted-foreground">
              {project.key}
            </span>
          </SettingsRow>
          <SettingsRow
            layout="stacked"
            label={m.project_settings_description_heading()}
            description={
              canEditBody ? (
                <MarkdownSaveIndicator status={status} />
              ) : undefined
            }
          >
            <div className="w-full">
              {canEditBody ? (
                <LexicalEditor
                  key={project.slug}
                  markdown={project.body}
                  onChange={async (next) => {
                    await update({ body: next })
                  }}
                  onStatusChange={setStatus}
                  className="rounded-lg border border-border bg-background px-3 py-2"
                />
              ) : (
                <Markdown>{project.body}</Markdown>
              )}
            </div>
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
