import { GroupId, TicketListQuery } from "@pp/shared"
import { useMatches, useNavigate, useRouter } from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import { Activity, useEffect, useMemo, useState } from "react"

import {
  useProject,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import {
  normalizeEstimateFilter,
  normalizeEstimateSort
} from "@/features/tickets/lib/estimateMeta"
import { useProjectView } from "@/hooks/useViewPreference"

import { SprintDetail } from "../../sprints/components/SprintDetail"
import { BacklogView } from "../../tickets/components/ticket-list/BacklogView"
import { ProjectTicketLayout } from "../../tickets/components/ticket-list/ProjectTicketLayout"

const decodeGroupId = Schema.decodeUnknownSync(GroupId)
const defaultTicketListQuery = Schema.decodeSync(TicketListQuery)({})
const encodeTicketListQuery = Schema.encodeSync(TicketListQuery)

export function RetainedProjectViews() {
  const { orgSlug, slug } = useProjectRoute()
  const { estimation } = useProject()
  const router = useRouter()
  const navigate = useNavigate()
  const backlog = useMatches({
    select: (matches) =>
      matches.find(
        (match) =>
          match.routeId ===
          "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/"
      )
  })
  const sprint = useMatches({
    select: (matches) =>
      matches.find(
        (match) =>
          match.routeId ===
          "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints/$groupId"
      )
  })
  const [lastBacklog, setLastBacklog] = useState(backlog?.search)
  const [lastSprint, setLastSprint] = useState(
    sprint && {
      groupId: sprint.params.groupId,
      search: sprint.search
    }
  )
  if (backlog && lastBacklog !== backlog.search) setLastBacklog(backlog.search)
  if (
    sprint &&
    (lastSprint?.groupId !== sprint.params.groupId ||
      lastSprint.search !== sprint.search)
  ) {
    setLastSprint({ groupId: sprint.params.groupId, search: sprint.search })
  }
  const updateQuery = (query: TicketListQuery) => {
    const nextSearch = encodeTicketListQuery(query)
    void navigate({
      to: router.state.location.pathname,
      search: (previous) => ({
        status: nextSearch.status,
        type: nextSearch.type,
        assignee: nextSearch.assignee,
        tags: nextSearch.tags,
        groupId: nextSearch.groupId,
        estimate: normalizeEstimateFilter(estimation, nextSearch.estimate),
        hasBranch: nextSearch.hasBranch,
        hasPr: nextSearch.hasPr,
        updatedAfter: nextSearch.updatedAfter,
        archived: nextSearch.archived,
        sort: normalizeEstimateSort(estimation, query.sort),
        q: nextSearch.q,
        cursor: undefined,
        view: previous.view
      }),
      replace: true,
      resetScroll: false
    })
  }
  const activeSort = (sprint ?? backlog)?.search.sort
  const normalizedSort = activeSort
    ? normalizeEstimateSort(estimation, activeSort)
    : undefined
  const activeEstimate = (sprint ?? backlog)?.search.estimate
  const normalizedEstimate = useMemo(
    () => normalizeEstimateFilter(estimation, activeEstimate),
    [estimation, activeEstimate]
  )
  useEffect(() => {
    if (
      (!activeEstimate?.length ||
        normalizedEstimate?.length === activeEstimate.length) &&
      normalizedSort === activeSort
    )
      return
    void navigate({
      to: router.state.location.pathname,
      search: (previous) => ({
        ...previous,
        updatedAfter: previous.updatedAfter?.toISOString(),
        estimate: normalizedEstimate,
        sort: normalizedSort,
        cursor: undefined
      }),
      replace: true,
      resetScroll: false
    })
  }, [
    normalizedEstimate,
    activeEstimate,
    normalizedSort,
    activeSort,
    navigate,
    router
  ])
  const backlogView = useProjectView(
    orgSlug,
    slug,
    lastBacklog?.view,
    "backlog"
  ).view
  const sprintView = useProjectView(
    orgSlug,
    slug,
    lastSprint?.search.view,
    "sprints"
  ).view
  const backlogQuery = useMemo(() => {
    if (!lastBacklog) return defaultTicketListQuery
    const { view: _view, estimate, ...query } = lastBacklog
    const normalized = normalizeEstimateFilter(estimation, estimate)
    const next = {
      ...query,
      sort: normalizeEstimateSort(estimation, query.sort)
    }
    return normalized === undefined ? next : { ...next, estimate: normalized }
  }, [lastBacklog, estimation])
  const sprintId = lastSprint ? decodeGroupId(lastSprint.groupId) : null
  const sprintQuery = useMemo(() => {
    if (!lastSprint) return defaultTicketListQuery
    const { view: _view, estimate, ...query } = lastSprint.search
    const normalized = normalizeEstimateFilter(estimation, estimate)
    const next = {
      ...query,
      sort: normalizeEstimateSort(estimation, query.sort),
      groupId: sprintId ? [sprintId] : query.groupId
    }
    return normalized === undefined ? next : { ...next, estimate: normalized }
  }, [lastSprint, sprintId, estimation])

  return (
    <Activity mode={backlog || sprint ? "visible" : "hidden"}>
      {(lastBacklog || lastSprint) && (
        <ProjectTicketLayout
          groupId={sprint ? sprintId : null}
          view={sprint ? sprintView : backlogView}
          query={sprint ? sprintQuery : backlogQuery}
          onQueryChange={updateQuery}
        >
          {({ grouping, preferencesKey, reorder }) => (
            <>
              <Activity mode={backlog ? "visible" : "hidden"}>
                {lastBacklog && (
                  <BacklogView
                    view={backlogView === "board" ? "board" : "list"}
                    query={backlogQuery}
                    grouping={grouping}
                    preferencesKey={preferencesKey}
                    reorder={reorder}
                  />
                )}
              </Activity>
              <Activity mode={sprint ? "visible" : "hidden"}>
                {lastSprint && sprintId && (
                  <SprintDetail
                    key={sprintId}
                    groupId={sprintId}
                    view={sprintView}
                    listQuery={sprintQuery}
                    reorder={reorder}
                  />
                )}
              </Activity>
            </>
          )}
        </ProjectTicketLayout>
      )}
    </Activity>
  )
}
