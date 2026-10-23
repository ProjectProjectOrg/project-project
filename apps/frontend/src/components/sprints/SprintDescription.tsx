import { useAtomSet } from "@effect/atom-react"
import type { GroupDetail } from "@pp/shared"
import { lazy, Suspense, useMemo, useState } from "react"

import type { SaveStatus } from "@/components/LexicalEditor"
import { MarkdownSaveIndicator } from "@/components/MarkdownSaveIndicator"
import {
  sprintRequest,
  updateSprintDetail
} from "@/features/sprints/atoms/sprintDetail"
import { MentionScopeProvider } from "@/mentions/scope"
import { m } from "@/paraglide/messages"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"

const Markdown = lazy(() =>
  import("@/components/Markdown").then((mod) => ({ default: mod.Markdown }))
)
const LexicalEditor = lazy(() =>
  import("@/components/LexicalEditor").then((mod) => ({
    default: mod.LexicalEditor
  }))
)

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
  const req = useMemo(
    () => sprintRequest(orgSlug, slug, sprint.id),
    [orgSlug, slug, sprint.id]
  )
  const update = useAtomSet(updateSprintDetail(req))
  const [status, setStatus] = useState<SaveStatus>("idle")

  if (disabled) {
    if (sprint.body.trim().length === 0) return null
    return (
      <Suspense fallback={null}>
        <Markdown className="rounded-lg border border-border bg-background px-3 py-2">
          {sprint.body}
        </Markdown>
      </Suspense>
    )
  }

  return (
    <div className="grid gap-2">
      <MentionScopeProvider scope={{ orgSlug, slug, members: project.members }}>
        <Suspense fallback={null}>
          <LexicalEditor
            key={`sprint:${sprint.id}`}
            markdown={sprint.body}
            onChange={(next) => {
              update({ body: next })
            }}
            onStatusChange={setStatus}
            placeholder={m.sprints_description_placeholder()}
            className="rounded-lg border border-border bg-background px-3 py-2"
          />
        </Suspense>
      </MentionScopeProvider>
      <MarkdownSaveIndicator
        status={status}
        className="justify-self-end tabular-nums"
      />
    </div>
  )
}
