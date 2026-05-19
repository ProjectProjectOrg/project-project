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
import { SprintTicketCreator } from "@/components/TicketList/SprintTicketCreator"
import { ErrorPage } from "@/components/ErrorPage"
import { NotFoundPage } from "@/components/NotFoundPage"
import { PageContainer } from "@/components/page"
import {
  sprintState,
  type GroupId,
  type TicketId,
  type TicketListQuery
} from "@projectproject/shared"
import { CompleteSprintForm } from "./CompleteSprintForm"
import { SprintBoard } from "./SprintBoard"
import { SprintDetailHeader } from "./SprintDetailHeader"
import { SprintDetailSkeleton } from "./SprintDetailSkeleton"
import { SprintTicketList } from "./SprintTicketList"

export function SprintDetail({
  orgSlug,
  slug,
  groupId,
  view,
  listQuery
}: {
  orgSlug: string
  slug: string
  groupId: GroupId
  view: "list" | "board"
  listQuery: TicketListQuery
}) {
  const project = useProject()
  const sprint = useAtomValue(sprintAtom(sprintKey(orgSlug, slug, groupId)))
  const list = useAtomValue(sprintsListAtom(projectKey(orgSlug, slug)))
  const [showCompleteForm, setShowCompleteForm] = useState(false)

  const wide = view === "board"

  return Result.matchWithError(sprint, {
    onInitial: () => (
      <PageContainer wide={wide}>
        <SprintDetailSkeleton />
      </PageContainer>
    ),
    onError: (error) =>
      error._tag === "NotFound" ? (
        <NotFoundPage
          contained
          title={m.sprints_not_found_title()}
          body={m.sprints_not_found_body()}
        />
      ) : (
        <ErrorPage
          contained
          error={error}
          title={m.sprints_load_error_title()}
          body={m.sprints_load_error_body()}
        />
      ),
    onDefect: (defect) => (
      <ErrorPage
        contained
        error={defect}
        title={m.sprints_load_error_title()}
        body={m.sprints_load_error_body()}
      />
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
      const filterIds = new Set(ticketIds)

      const creator = isCompleted ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {m.sprints_completed_closed_notice()}
        </p>
      ) : (
        <SprintTicketCreator
          orgSlug={orgSlug}
          slug={slug}
          groupId={display.id}
          excludeIds={filterIds}
        />
      )

      const body = wide ? (
        <PageContainer wide>
          <SprintBoard
            orgSlug={orgSlug}
            slug={slug}
            groupId={display.id}
            ticketIds={ticketIds}
            members={project.members}
            isCompleted={isCompleted}
          />
        </PageContainer>
      ) : (
        <PageContainer>
          <SprintTicketList
            orgSlug={orgSlug}
            slug={slug}
            query={listQuery}
            members={project.members}
            creator={creator}
          />
        </PageContainer>
      )

      return (
        <div className="flex flex-col gap-4">
          <PageContainer wide={wide}>
            <div className="flex flex-col gap-4">
              <SprintDetailHeader
                orgSlug={orgSlug}
                slug={slug}
                sprint={display}
                onRequestComplete={
                  isCompleted ? undefined : () => setShowCompleteForm(true)
                }
              />
              {wide && creator}
              {showCompleteForm && state === "active" && (
                <CompleteSprintForm
                  orgSlug={orgSlug}
                  slug={slug}
                  sprint={display}
                  sprints={allSprints}
                  onDone={() => setShowCompleteForm(false)}
                />
              )}
            </div>
          </PageContainer>
          {body}
        </div>
      )
    }
  })
}
