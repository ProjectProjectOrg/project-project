import { useAtomSet } from "@effect/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { LexicalEditor, type SaveStatus } from "@/components/LexicalEditor"
import { MarkdownSaveIndicator } from "@/components/MarkdownSaveIndicator"
import { PageContainer } from "@/components/page"
import {
  projectRequest,
  updateProject
} from "@/features/projects/atoms/projects"
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
