import { Activity, useMemo, useState } from "react"
import { useMatches, useNavigate, useRouter } from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import { GroupId, TicketListQuery } from "@projectproject/shared"
import { useProjectView } from "@/hooks/useViewPreference"
import { BacklogView } from "./TicketList/BacklogView"
import { SprintDetail } from "./sprints/SprintDetail"

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
        (match) => match.routeId === "/_authed/orgs/$orgSlug/projects/$slug/"
      )
  })
  const sprint = useMatches({
    select: (matches) =>
      matches.find(
        (match) =>
          match.routeId ===
          "/_authed/orgs/$orgSlug/projects/$slug/sprints/$groupId"
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
  const backlogView = useProjectView(orgSlug, slug, lastBacklog?.view).view
  const sprintView = useProjectView(orgSlug, slug, lastSprint?.search.view).view
  const backlogQuery = useMemo(
    () => lastBacklog ?? defaultTicketListQuery,
    [lastBacklog]
  )
  const sprintId = lastSprint ? decodeGroupId(lastSprint.groupId) : null
  const sprintQuery = useMemo(() => {
    const query = lastSprint?.search ?? defaultTicketListQuery
    return sprintId ? { ...query, groupId: [sprintId] } : query
  }, [lastSprint?.search, sprintId])

  return (
    <>
      <Activity mode={backlog ? "visible" : "hidden"}>
        {lastBacklog && (
          <BacklogView
            orgSlug={orgSlug}
            slug={slug}
            view={backlogView === "board" ? "board" : "list"}
            query={backlogQuery}
            onQueryChange={updateQuery}
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
            onQueryChange={updateQuery}
          />
        )}
      </Activity>
    </>
  )
}
