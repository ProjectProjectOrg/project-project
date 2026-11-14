import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { GroupPolicy } from "@pp/access/policies"
import type { Group } from "@pp/shared"
import { getRouteApi, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { PageContainer } from "@/components/shell/Page"
import { Button } from "@/components/ui/button"
import { createSprintDialog } from "@/features/sprints/atoms/createSprintDialog"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { nowDate } from "@/features/sprints/lib/sprintDates"
import { sprintOverview } from "@/features/sprints/lib/sprintOverview"
import { useProjectActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

import { LedgerGroup, LedgerList, LedgerRow } from "./SprintLedger"
import { SprintsEmpty } from "./SprintsEmpty"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints/"
)

const COMPLETED_PREVIEW = 5

export function SprintsIndex() {
  const { orgSlug, slug } = routeApi.useParams()
  const req = sprintListRequest(orgSlug, slug)
  const list = useAtomValue(sprintList(req))
  const refresh = useAtomRefresh(sprintList(req))
  const canPlan = GroupPolicy.can(useProjectActor(), "sprint", "manage")

  return (
    <AsyncView
      result={list}
      contained
      reset={refresh}
      onInitial={() => <OverviewSkeleton />}
      onSuccess={({ value }) =>
        value.length === 0 ? (
          <PageContainer>
            <SprintsEmpty>
              {canPlan && <NewSprintButton variant="primary" />}
            </SprintsEmpty>
          </PageContainer>
        ) : (
          <Overview sprints={value} canPlan={canPlan} />
        )
      }
    />
  )
}

function Overview({
  sprints,
  canPlan
}: Readonly<{ sprints: ReadonlyArray<Group>; canPlan: boolean }>) {
  const { orgSlug, slug } = routeApi.useParams()
  const now = nowDate()
  const { active, upcoming, completed } = sprintOverview(sprints, now)
  const [showAll, setShowAll] = useState(false)
  const shownCompleted = showAll
    ? completed
    : completed.slice(0, COMPLETED_PREVIEW)

  return (
    <PageContainer className="gap-8 pb-10">
      <LedgerList>
        {active.length > 0 && (
          <LedgerGroup
            title={m.sprints_overview_current_heading()}
            count={active.length}
          >
            {active.map((sprint, index) => (
              <LedgerRow
                key={sprint.id}
                index={index}
                sprint={sprint}
                now={now}
                canStart={false}
              />
            ))}
          </LedgerGroup>
        )}

        <LedgerGroup
          title={m.sprints_overview_upcoming_heading()}
          count={upcoming.length}
          action={
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="xs"
                render={
                  <Link
                    to="/orgs/$orgSlug/projects/$slug"
                    params={{ orgSlug, slug }}
                    search={{ view: "list", group: "sprint" }}
                  />
                }
              >
                {m.sprints_overview_plan()}
              </Button>
              {canPlan && <NewSprintButton variant="secondary" />}
            </div>
          }
        >
          {upcoming.length === 0 ? (
            <li className="px-3 py-3 text-caption text-muted-foreground">
              {m.sprints_overview_upcoming_empty()}
            </li>
          ) : (
            upcoming.map((sprint, index) => (
              <LedgerRow
                key={sprint.id}
                index={active.length + index}
                sprint={sprint}
                now={now}
                canStart={canPlan && active.length === 0 && index === 0}
              />
            ))
          )}
        </LedgerGroup>

        {completed.length > 0 && (
          <LedgerGroup
            title={m.sprints_overview_completed_heading()}
            count={completed.length}
            action={
              completed.length > COMPLETED_PREVIEW && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowAll((shown) => !shown)}
                >
                  {showAll
                    ? m.sprints_overview_show_less()
                    : m.sprints_overview_show_all({ count: completed.length })}
                </Button>
              )
            }
          >
            {shownCompleted.map((sprint, index) => (
              <LedgerRow
                key={sprint.id}
                index={active.length + upcoming.length + index}
                sprint={sprint}
                now={now}
                canStart={false}
              />
            ))}
          </LedgerGroup>
        )}
      </LedgerList>
    </PageContainer>
  )
}

function NewSprintButton({
  variant
}: Readonly<{ variant: "primary" | "secondary" }>) {
  const { orgSlug, slug } = routeApi.useParams()
  const open = useAtomSet(createSprintDialog)
  return (
    <Button
      variant={variant}
      size={variant === "primary" ? "sm" : "xs"}
      leadingIcon={Plus}
      onClick={() => open({ orgSlug, projectSlug: slug })}
    >
      {m.sprints_new_button()}
    </Button>
  )
}

function OverviewSkeleton() {
  return (
    <PageContainer className="gap-8" aria-busy="true">
      <div className="h-28 animate-pulse rounded-lg bg-muted/60 motion-reduce:animate-none" />
      <div className="h-40 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none" />
    </PageContainer>
  )
}
