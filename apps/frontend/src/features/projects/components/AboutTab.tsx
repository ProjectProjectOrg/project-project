import { useAtomSet } from "@effect/atom-react"
import { ProjectPolicy } from "@pp/access/policies"
import { getRouteApi } from "@tanstack/react-router"
import { useState } from "react"

import { PageContainer } from "@/components/shell/Page"
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
import { useProject } from "@/features/projects/hooks/useProject"
import { useProjectActor } from "@/lib/access"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/about"
)

export function AboutTab() {
  const { orgSlug } = routeApi.useParams()
  const project = useProject()
  const update = useAtomSet(
    updateProject(projectRequest(orgSlug, project.slug))
  )
  const [status, setStatus] = useState<SaveStatus>("idle")
  const canEdit = ProjectPolicy.canUpdate(useProjectActor(), { body: true })

  if (!canEdit) {
    return (
      <PageContainer>
        <Markdown>{project.body}</Markdown>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="grid gap-2">
        <LexicalEditor
          key={project.slug}
          markdown={project.body}
          onChange={(next) => update({ body: next })}
          onStatusChange={setStatus}
          className="rounded-lg border border-border bg-background px-3 py-2"
        />
        <MarkdownSaveIndicator
          status={status}
          className="justify-self-end tabular-nums"
        />
      </div>
    </PageContainer>
  )
}
