import { useAtomSet } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { projectKey, updateProjectAtom } from "@/atoms/projects"
import { projectWriteKeys } from "@/atoms/reactivity-keys"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { LexicalEditor, type SaveStatus } from "@/components/LexicalEditor"
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
        <SaveIndicator status={status} />
      </CardHeader>
      <CardContent>
        <LexicalEditor
          key={project.slug}
          markdown={project.body}
          onChange={(next) =>
            update({
              path: { orgSlug, slug: project.slug },
              payload: { body: next },
              reactivityKeys: projectWriteKeys
            })
          }
          onStatusChange={setStatus}
        />
      </CardContent>
    </Card>
  )
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const label =
    status === "saving"
      ? m.tickets_save_status_saving()
      : status === "dirty"
        ? m.tickets_save_status_dirty()
        : status === "saved"
          ? m.tickets_save_status_saved()
          : null
  if (!label) return null
  return (
    <span className="text-xs text-muted-foreground tabular-nums">{label}</span>
  )
}
