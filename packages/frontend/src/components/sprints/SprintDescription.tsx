import { useAtomSet } from "@effect-atom/atom-react"
import { useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { LexicalEditor, type SaveStatus } from "@/components/LexicalEditor"
import { MarkdownSaveIndicator } from "@/components/MarkdownSaveIndicator"
import { MentionScopeProvider } from "@/mentions/scope"
import { m } from "@/paraglide/messages"
import { projectKey, updateSprintAtom } from "@/atoms/sprints"
import type { GroupDetail } from "@projectproject/shared"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"

export function SprintDescription({
  orgSlug,
  slug,
  sprint,
  disabled
}: {
  orgSlug: string
  slug: string
  sprint: GroupDetail
  disabled: boolean
}) {
  const project = useProject()
  const key = projectKey(orgSlug, slug)
  const update = useAtomSet(updateSprintAtom(key))
  const [status, setStatus] = useState<SaveStatus>("idle")

  if (disabled && sprint.body.trim().length === 0) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-baseline justify-between gap-4">
        <CardTitle>{m.sprints_description_label()}</CardTitle>
        <MarkdownSaveIndicator status={status} className="tabular-nums" />
      </CardHeader>
      <CardContent>
        <MentionScopeProvider
          scope={{ orgSlug, slug, members: project.members }}
        >
          <LexicalEditor
            key={`sprint:${sprint.id}`}
            markdown={sprint.body}
            onChange={(next) => {
              if (disabled) return
              update({ groupId: sprint.id, patch: { body: next } })
            }}
            onStatusChange={setStatus}
            placeholder={m.sprints_description_placeholder()}
          />
        </MentionScopeProvider>
      </CardContent>
    </Card>
  )
}
