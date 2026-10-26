import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { ProjectPolicy } from "@pp/access/policies"
import { getRouteApi } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { useState } from "react"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsTextField } from "@/components/shell/settings/SettingsTextField"
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
import { useProject } from "@/features/projects/hooks/useProject"
import { useProjectActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/general"
)

export function ProjectGeneralSettings() {
  const { orgSlug } = routeApi.useParams()
  const project = useProject()
  const req = projectRequest(orgSlug, project.slug)
  const update = useAtomSet(updateProject(req), { mode: "promiseExit" })
  const updateState = useAtomValue(updateProject(req))
  const actor = useProjectActor()
  const canEdit = ProjectPolicy.canUpdate(actor, { settings: true })
  const canEditBody = ProjectPolicy.canUpdate(actor, { body: true })
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
            error={
              Result.isFailure(updateState)
                ? m.project_settings_name_error()
                : null
            }
          >
            <SettingsTextField
              value={project.name}
              onCommit={(name) => update({ name })}
              disabled={!canEdit}
              waiting={updateState.waiting}
              maxLength={120}
            />
          </SettingsRow>
          <SettingsRow
            label={m.project_settings_key_label()}
            description={m.project_settings_key_description()}
          >
            <span className="font-mono text-[13px] text-muted-foreground">
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
    </>
  )
}
