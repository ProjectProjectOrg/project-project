import {
  GroupId,
  TicketListQuery,
  ticketRule,
  withoutTicketRule
} from "@pp/shared"
import { useMatches, useNavigate, useRouter } from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import { Activity, useEffect, useMemo, useState } from "react"

import {
  useProject,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import {
  normalizeEstimateFilter,
  normalizeEstimateRules,
  normalizeEstimateSort
} from "@/features/tickets/lib/estimateMeta"
import { restoreStatusRule } from "@/features/tickets/lib/ticketFilters"
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
  return view === "board"
    ? { ...query, rules: withoutTicketRule(query, "status") }
    : query
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
  const activeEstimate = activeQuery
    ? ticketRule(activeQuery, "estimate")?.values
    : undefined
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
          rules: normalizeEstimateRules(estimation, activeQuery),
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
    estimation,
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
  const querySearch = (query: TicketListQuery, previous: TicketListSearch) => {
    const nextSearch = ticketSearchFromQuery({
      ...query,
      rules: normalizeEstimateRules(estimation, query),
      sort: normalizeEstimateSort(estimation, query.sort)
    })
    return {
      ...nextSearch,
      rule: boardActive
        ? ticketSearchFromQuery({
            ...query,
            rules: restoreStatusRule(query, ticketQueryFromSearch(previous))
          }).rule
        : nextSearch.rule,
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
  const backlogQuery = useMemo(() => {
    if (!lastBacklog) return defaultTicketListQuery
    const query = ticketQueryFromSearch(lastBacklog)
    const next = {
      ...query,
      rules: normalizeEstimateRules(estimation, query),
      sort: normalizeEstimateSort(estimation, query.sort)
    }
    return forView(next, backlogView)
  }, [lastBacklog, estimation, backlogView])
  const sprintId = lastSprint ? decodeGroupId(lastSprint.groupId) : null
  const sprintQuery = useMemo(() => {
    if (!lastSprint) return defaultTicketListQuery
    const query = ticketQueryFromSearch(lastSprint.search)
    const next = {
      ...query,
      rules: normalizeEstimateRules(estimation, query),
      sort: normalizeEstimateSort(estimation, query.sort),
      scopeGroupId: sprintId ?? undefined
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
