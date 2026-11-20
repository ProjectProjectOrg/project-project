import { useAtomSet } from "@effect/atom-react"
import type { GroupDetail } from "@pp/shared"
import { MentionScopeProvider } from "@pp/ui/editor/mentions/scope"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"

import { EditableMarkdown } from "@/features/editor/components/EditableMarkdown"
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
  const blank = sprint.body.trim().length === 0

  if (disabled && blank) {
    return (
      <p className="px-3 py-2 text-body text-muted-foreground">
        {m.sprints_description_empty()}
      </p>
    )
  }

  return (
    <MentionScopeProvider scope={{ orgSlug, slug, members: project.members }}>
      <EditableMarkdown
        markdown={sprint.body}
        editorKey={`sprint:${sprint.id}`}
        canEdit={!disabled}
        blank={blank}
        placeholder={m.sprints_description_placeholder()}
        onSave={async (next) => {
          const exit = await update({ body: next })
          if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
        }}
      />
    </MentionScopeProvider>
  )
}
