import { useAtomSet } from "@effect/atom-react"
import type { GroupDetail } from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import { useState } from "react"

import {
  LexicalEditor,
  type SaveStatus
} from "@/features/editor/components/LexicalEditor"
import { Markdown } from "@/features/editor/components/Markdown"
import { MarkdownSaveIndicator } from "@/features/editor/components/MarkdownSaveIndicator"
import { MentionScopeProvider } from "@/features/editor/mentions/scope"
import {
  useProject,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import {
  sprintRequest,
  updateSprintDetail
} from "@/features/sprints/atoms/sprintDetail"
import { m } from "@/paraglide/messages"

export function SprintDescription({
  sprint,
  disabled
}: {
  sprint: GroupDetail
  disabled: boolean
}) {
  const { orgSlug, slug } = useProjectRoute()
  const project = useProject()
  const req = sprintRequest(orgSlug, slug, sprint.id)
  const update = useAtomSet(updateSprintDetail(req), { mode: "promiseExit" })
  const [status, setStatus] = useState<SaveStatus>("idle")

  if (disabled) {
    if (sprint.body.trim().length === 0) return null
    return (
      <Markdown className="rounded-lg border border-border bg-background px-3 py-2">
        {sprint.body}
      </Markdown>
    )
  }

  return (
    <div className="grid gap-2">
      <MentionScopeProvider scope={{ orgSlug, slug, members: project.members }}>
        <LexicalEditor
          key={`sprint:${sprint.id}`}
          markdown={sprint.body}
          onChange={async (next) => {
            const exit = await update({ body: next })
            if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
          }}
          onStatusChange={setStatus}
          placeholder={m.sprints_description_placeholder()}
          className="rounded-lg border border-border bg-background px-3 py-2"
        />
      </MentionScopeProvider>
      <MarkdownSaveIndicator
        status={status}
        className="justify-self-end tabular-nums"
      />
    </div>
  )
}
