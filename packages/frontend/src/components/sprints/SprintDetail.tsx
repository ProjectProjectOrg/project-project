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
import { SprintDetailHeader } from "./SprintDetailHeader"
import { SprintDetailSkeleton } from "./SprintDetailSkeleton"
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
    onInitial: () => <SprintDetailSkeleton />,
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
      const allSprints = Result.isSuccess(list) ? list.value : []
      const fromList = allSprints.find((s) => s.id === value.id)
      const display = fromList
        ? {
            ...value,
            name: fromList.name,
            color: fromList.color,
            startsAt: fromList.startsAt,
            endsAt: fromList.endsAt,
            completedAt: fromList.completedAt,
            updatedAt: fromList.updatedAt,
            tickets: fromList.tickets
          }
        : value
      const isCompleted = display.completedAt !== null
      const state = sprintState(display)
      const ticketIds = display.tickets as ReadonlyArray<TicketId>
      const uiKey = `${orgSlug}/${slug}/sprints/${groupId}`

      return (
        <div className="flex flex-col gap-4">
          <SprintDetailHeader
            orgSlug={orgSlug}
            slug={slug}
            sprint={display}
            onRequestComplete={
              isCompleted ? undefined : () => setShowCompleteForm(true)
            }
          />

          {showCompleteForm && state === "active" && (
            <CompleteSprintForm
              orgSlug={orgSlug}
              slug={slug}
              sprint={display}
              sprints={allSprints}
              onDone={() => setShowCompleteForm(false)}
            />
          )}

          <SprintTicketList
            orgSlug={orgSlug}
            slug={slug}
            groupId={display.id}
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
