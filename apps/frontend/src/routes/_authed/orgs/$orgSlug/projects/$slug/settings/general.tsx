import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { ProjectPolicy } from "@pp/access/policies"
import { createFileRoute } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useState } from "react"

import { ProjectAppearanceSection } from "@/components/appearance/ProjectAppearanceSection"
import { LexicalEditor, type SaveStatus } from "@/components/LexicalEditor"
import { Markdown } from "@/components/Markdown"
import { MarkdownSaveIndicator } from "@/components/MarkdownSaveIndicator"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/settings/SettingsSection"
import { SettingsTextField } from "@/components/settings/SettingsTextField"
import {
  projectRequest,
  updateProject
} from "@/features/projects/atoms/projects"
import { useProjectActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

import { useProject } from "../-context"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/general"
)({
  component: GeneralSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.project_settings_general_tab() }
  })
})

function GeneralSettings() {
  const { orgSlug } = Route.useParams()
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
        orgSlug={orgSlug}
        slug={project.slug}
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
