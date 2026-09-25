import { useAtomSet } from "@effect/atom-react"
import { ProjectPolicy } from "@pp/access/policies"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { LexicalEditor, type SaveStatus } from "@/components/LexicalEditor"
import { Markdown } from "@/components/Markdown"
import { MarkdownSaveIndicator } from "@/components/MarkdownSaveIndicator"
import { PageContainer } from "@/components/page"
import {
  projectRequest,
  updateProject
} from "@/features/projects/atoms/projects"
import { useProjectActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

import { useProject } from "../-context"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/about"
)({
  component: AboutTab,
  loader: () => ({
    crumb: { type: "static" as const, label: m.project_detail_tab_about() }
  })
})

function AboutTab() {
  const { orgSlug } = Route.useParams()
  const project = useProject()
  const update = useAtomSet(
    updateProject(projectRequest(orgSlug, project.slug))
  )
  const [status, setStatus] = useState<SaveStatus>("idle")
  const canEdit = ProjectPolicy.canUpdate(useProjectActor(), {
    body: true,
    settings: false
  })

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
