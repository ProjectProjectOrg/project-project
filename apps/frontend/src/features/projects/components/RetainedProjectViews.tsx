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
import {
  ticketQueryFromSearch,
  ticketSearchFromQuery,
  type TicketListSearch
} from "@/features/tickets/lib/ticketSearch"
import { useProjectView } from "@/hooks/useViewPreference"

import { SprintDetail } from "../../sprints/components/SprintDetail"
import { BacklogView } from "../../tickets/components/ticket-list/BacklogView"
import { ProjectTicketLayout } from "../../tickets/components/ticket-list/ProjectTicketLayout"

const decodeGroupId = Schema.decodeUnknownSync(GroupId)
const defaultTicketListQuery = Schema.decodeSync(TicketListQuery)({})

const forView = (query: TicketListQuery, view: string): TicketListQuery => {
  if (view !== "board" || query.status === undefined) return query
  const { status: _status, ...rest } = query
  return rest
}

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
  const activeSearch = (sprint ?? backlog)?.search
  const activeQuery = useMemo(
    () => activeSearch && ticketQueryFromSearch(activeSearch),
    [activeSearch]
  )
  const activeSort = activeQuery?.sort
  const normalizedSort = activeSort
    ? normalizeEstimateSort(estimation, activeSort)
    : undefined
  const activeEstimate = (sprint ?? backlog)?.search.estimate
  const normalizedEstimate = useMemo(
    () => normalizeEstimateFilter(estimation, activeEstimate),
    [estimation, activeEstimate]
  )
  useEffect(() => {
    if (!activeQuery) return
    if (
      (!activeEstimate?.length ||
        normalizedEstimate?.length === activeEstimate.length) &&
      normalizedSort === activeSort
    )
      return
    void navigate({
      to: router.state.location.pathname,
      search: (previous) => ({
        ...ticketSearchFromQuery({
          ...activeQuery,
          estimate: normalizedEstimate,
          sort: normalizedSort ?? activeQuery.sort,
          cursor: undefined
        }),
        view: previous.view
      }),
      replace: true,
      resetScroll: false
    })
  }, [
    activeQuery,
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
  const boardActive = (sprint ? sprintView : backlogView) === "board"
  const querySearch = (
    query: TicketListQuery,
    previous: Pick<TicketListSearch, "status">
  ) => {
    const nextSearch = ticketSearchFromQuery({
      ...query,
      estimate: normalizeEstimateFilter(estimation, query.estimate),
      sort: normalizeEstimateSort(estimation, query.sort)
    })
    return {
      ...nextSearch,
      status: boardActive ? previous.status : nextSearch.status,
      cursor: undefined
    }
  }
  const updateQuery = (query: TicketListQuery) => {
    void navigate({
      to: router.state.location.pathname,
      search: (previous) => ({
        ...querySearch(query, previous),
        view: previous.view
      }),
      replace: true,
      resetScroll: false
    })
  }
  const prefetchQuery = (query: TicketListQuery) => {
    void router.preloadRoute({
      to: router.state.location.pathname,
      search: (previous) => ({
        ...querySearch(query, previous),
        view: previous.view
      })
    })
  }
  const backlogQuery = useMemo(() => {
    if (!lastBacklog) return defaultTicketListQuery
    const query = ticketQueryFromSearch(lastBacklog)
    const normalized = normalizeEstimateFilter(estimation, query.estimate)
    const next = {
      ...query,
      estimate: normalized,
      sort: normalizeEstimateSort(estimation, query.sort)
    }
    return forView(next, backlogView)
  }, [lastBacklog, estimation, backlogView])
  const sprintId = lastSprint ? decodeGroupId(lastSprint.groupId) : null
  const sprintQuery = useMemo(() => {
    if (!lastSprint) return defaultTicketListQuery
    const query = ticketQueryFromSearch(lastSprint.search)
    const normalized = normalizeEstimateFilter(estimation, query.estimate)
    const next = {
      ...query,
      estimate: normalized,
      sort: normalizeEstimateSort(estimation, query.sort),
      groupId: sprintId ? [sprintId] : query.groupId
    }
    return forView(next, sprintView)
  }, [lastSprint, sprintId, estimation, sprintView])

  return (
    <Activity mode={backlog || sprint ? "visible" : "hidden"}>
      {(lastBacklog || lastSprint) && (
        <ProjectTicketLayout
          groupId={sprint ? sprintId : null}
          view={sprint ? sprintView : backlogView}
          query={sprint ? sprintQuery : backlogQuery}
          onQueryChange={updateQuery}
          onQueryPrefetch={prefetchQuery}
        >
          {({ grouping, preferencesKey, reorder }) => (
            <>
              <Activity mode={backlog ? "visible" : "hidden"}>
                {lastBacklog && (
                  <BacklogView
                    view={backlogView === "board" ? "board" : "list"}
                    query={backlogQuery}
                    onQueryChange={updateQuery}
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
