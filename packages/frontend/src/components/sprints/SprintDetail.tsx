import { Result, useAtomValue } from "@effect-atom/atom-react"
import { useState } from "react"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"
import { m } from "@/paraglide/messages"
import {
  projectKey,
  sprintAtom,
  sprintKey,
  sprintsListAtom
} from "@/atoms/sprints"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from "@/components/ui/empty"
import { sprintState, type GroupId, type TicketId } from "@projectproject/shared"
import { CompleteSprintForm } from "./CompleteSprintForm"
import { SprintAddTicketsPicker } from "./SprintAddTicketsPicker"
import { SprintDetailHeader } from "./SprintDetailHeader"
import { SprintTicketList } from "./SprintTicketList"

export function SprintDetail({
  orgSlug,
  slug,
  groupId
}: {
  orgSlug: string
  slug: string
  groupId: GroupId
}) {
  const project = useProject()
  const sprint = useAtomValue(sprintAtom(sprintKey(orgSlug, slug, groupId)))
  const list = useAtomValue(sprintsListAtom(projectKey(orgSlug, slug)))
  const [showCompleteForm, setShowCompleteForm] = useState(false)

  return Result.matchWithError(sprint, {
    onInitial: () => (
      <div className="skeleton h-40 rounded-xl border border-border" />
    ),
    onError: (error) =>
      error._tag === "NotFound" ? (
        <Empty className="rounded-xl border border-dashed border-border p-6">
          <EmptyHeader>
            <EmptyTitle>{m.sprints_not_found_title()}</EmptyTitle>
            <EmptyDescription>
              {m.sprints_not_found_description()}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Empty className="rounded-xl border border-dashed border-border p-6">
          <EmptyHeader>
            <EmptyTitle>{m.sprints_load_error_title()}</EmptyTitle>
            <EmptyDescription>
              {m.sprints_load_error({ tag: error._tag })}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ),
    onDefect: (defect) => (
      <Empty className="rounded-xl border border-dashed border-border p-6">
        <EmptyHeader>
          <EmptyDescription>
            {m.chrome_defect({ defect: String(defect) })}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    ),
    onSuccess: ({ value }) => {
      const isCompleted = value.completedAt !== null
      const state = sprintState(value)
      const ticketIds = value.tickets as ReadonlyArray<TicketId>
      const allSprints = Result.isSuccess(list) ? list.value : []
      const uiKey = `${orgSlug}/${slug}/sprints/${groupId}`

      return (
        <div className="flex flex-col gap-4">
          <SprintDetailHeader
            orgSlug={orgSlug}
            slug={slug}
            sprint={value}
            onRequestComplete={
              isCompleted ? undefined : () => setShowCompleteForm(true)
            }
          />

          {!isCompleted && (
            <div className="flex items-center gap-2">
              <SprintAddTicketsPicker
                orgSlug={orgSlug}
                slug={slug}
                groupId={value.id}
                excludeIds={new Set(ticketIds)}
              />
            </div>
          )}

          {showCompleteForm && state === "active" && (
            <CompleteSprintForm
              orgSlug={orgSlug}
              slug={slug}
              sprint={value}
              sprints={allSprints}
              onDone={() => setShowCompleteForm(false)}
            />
          )}

          <SprintTicketList
            orgSlug={orgSlug}
            slug={slug}
            groupId={value.id}
            ticketIds={ticketIds}
            members={project.members}
            uiKey={uiKey}
            isCompleted={isCompleted}
          />
        </div>
      )
    }
  })
}
