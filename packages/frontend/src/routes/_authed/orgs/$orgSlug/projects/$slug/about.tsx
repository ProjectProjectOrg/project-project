import { useAtomSet } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { projectKey, updateProjectAtom } from "@/atoms/projects"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { LexicalEditor, type SaveStatus } from "@/components/LexicalEditor"
import { MarkdownSaveIndicator } from "@/components/MarkdownSaveIndicator"
import { PageContainer } from "@/components/page"
import { m } from "@/paraglide/messages"
import { useProject } from "./-context"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/about"
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
    updateProjectAtom(projectKey(orgSlug, project.slug))
  )
  const [status, setStatus] = useState<SaveStatus>("idle")

  return (
    <PageContainer>
      <Card>
        <CardHeader className="flex flex-row items-baseline justify-between gap-4">
          <div>
            <CardTitle>{m.project_detail_about_heading()}</CardTitle>
            <CardDescription>
              {m.project_detail_about_storage_prefix()}{" "}
              <span className="font-mono">project.md</span>
              {m.project_detail_about_storage_suffix()}
            </CardDescription>
          </div>
          <MarkdownSaveIndicator status={status} className="tabular-nums" />
        </CardHeader>
        <CardContent>
          <LexicalEditor
            key={project.slug}
            markdown={project.body}
            onChange={(next) => update({ body: next })}
            onStatusChange={setStatus}
          />
        </CardContent>
      </Card>
    </PageContainer>
  )
}
