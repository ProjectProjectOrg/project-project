import { GroupId, TicketListQuery } from "@pp/shared"
import { useMatches, useNavigate, useRouter } from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import { Activity, useMemo, useState } from "react"

import { useProjectView } from "@/hooks/useViewPreference"

import { SprintDetail } from "./sprints/SprintDetail"
import { BacklogView } from "./TicketList/BacklogView"
import { ProjectTicketLayout } from "./TicketList/ProjectTicketLayout"

const decodeGroupId = Schema.decodeUnknownSync(GroupId)
const defaultTicketListQuery = Schema.decodeSync(TicketListQuery)({})
const encodeTicketListQuery = Schema.encodeSync(TicketListQuery)

export function RetainedProjectViews({
  orgSlug,
  slug
}: {
  orgSlug: string
  slug: string
}) {
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
        hasBranch: nextSearch.hasBranch,
        hasPr: nextSearch.hasPr,
        updatedAfter: nextSearch.updatedAfter,
        archived: nextSearch.archived,
        sort: nextSearch.sort,
        q: nextSearch.q,
        cursor: undefined,
        view: previous.view
      }),
      replace: true,
      resetScroll: false
    })
  }
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
    const { view: _view, ...query } = lastBacklog
    return query
  }, [lastBacklog])
  const sprintId = lastSprint ? decodeGroupId(lastSprint.groupId) : null
  const sprintQuery = useMemo(() => {
    if (!lastSprint) return defaultTicketListQuery
    const { view: _view, ...query } = lastSprint.search
    return sprintId ? { ...query, groupId: [sprintId] } : query
  }, [lastSprint, sprintId])

  return (
    <Activity mode={backlog || sprint ? "visible" : "hidden"}>
      <ProjectTicketLayout
        orgSlug={orgSlug}
        slug={slug}
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
                  orgSlug={orgSlug}
                  slug={slug}
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
                  orgSlug={orgSlug}
                  slug={slug}
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
    </Activity>
  )
}
