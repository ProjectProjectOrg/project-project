// About tab — markdown description editor (the project body).

import { useAtomSet } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { updateProjectAtom } from "@/atoms/projects"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { LexicalEditor, type SaveStatus } from "@/components/LexicalEditor"
import { useProject } from "./-context"

export const Route = createFileRoute("/_authed/projects/$slug/about")({
  component: AboutTab,
  loader: () => ({
    crumb: { type: "static" as const, label: "About" }
  })
})

function AboutTab() {
  const project = useProject()
  const update = useAtomSet(updateProjectAtom)
  const [status, setStatus] = useState<SaveStatus>("idle")

  return (
    <Card>
      <CardHeader className="flex flex-row items-baseline justify-between gap-4">
        <div>
          <CardTitle>Description</CardTitle>
          <CardDescription>
            Stored as <span className="font-mono">project.md</span> on disk.
          </CardDescription>
        </div>
        <SaveIndicator status={status} />
      </CardHeader>
      <CardContent>
        <LexicalEditor
          key={project.slug}
          markdown={project.body}
          onChange={(next) => update({ slug: project.slug, body: next })}
          onStatusChange={setStatus}
        />
      </CardContent>
    </Card>
  )
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const label =
    status === "saving"
      ? "Saving…"
      : status === "dirty"
        ? "Unsaved changes"
        : status === "saved"
          ? "Saved"
          : null
  if (!label) return null
  return (
    <span className="text-xs text-muted-foreground tabular-nums">{label}</span>
  )
}
