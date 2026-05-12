import { useAtom, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { TicketList } from "@/components/TicketList"
import { PageContainer } from "@/components/page"
import { projectKey, sprintMembershipAtom } from "@/atoms/sprints"
import {
  assigneeFilterAtom,
  queryAtom,
  selectedTagsAtom,
  sortKeyAtom,
  sprintFilterAtom,
  statusFilterAtom,
  ticketListUiKey,
  typeFilterAtom,
  type SprintFilter
} from "@/atoms/ticketListUi"
import { SORTS, type SortKey } from "@/components/TicketList/sort"
import type { TagName, TicketStatus, TicketType } from "@projectproject/shared"
import { useProject } from "./-context"

const STATUS_VALUES: ReadonlyArray<TicketStatus | "all"> = [
  "all",
  "todo",
  "in_progress",
  "done"
]
const TYPE_VALUES: ReadonlyArray<TicketType | "all"> = [
  "all",
  "feat",
  "bug",
  "chore",
  "other"
]
const SORT_VALUES = Object.keys(SORTS) as ReadonlyArray<SortKey>

function parseTags(value: unknown): ReadonlyArray<TagName> {
  if (typeof value !== "string" || value.length === 0) return []
  return value.split(",").filter(Boolean) as unknown as ReadonlyArray<TagName>
}

interface ProjectIndexSearch {
  ticket?: string
  focusBody?: 1
  q?: string
  status?: TicketStatus | "all"
  type?: TicketType | "all"
  assignee?: string
  sort?: SortKey
  sprint?: string
  tags?: string
}

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/$slug/")({
  component: TicketsTab,
  validateSearch: (search: Record<string, unknown>): ProjectIndexSearch => {
    const out: ProjectIndexSearch = {}
    if (typeof search.ticket === "string") out.ticket = search.ticket
    if (search.focusBody === 1) out.focusBody = 1
    if (typeof search.q === "string" && search.q.length > 0) out.q = search.q
    if (
      typeof search.status === "string" &&
      STATUS_VALUES.includes(search.status as TicketStatus | "all")
    ) {
      out.status = search.status as TicketStatus | "all"
    }
    if (
      typeof search.type === "string" &&
      TYPE_VALUES.includes(search.type as TicketType | "all")
    ) {
      out.type = search.type as TicketType | "all"
    }
    if (typeof search.assignee === "string") out.assignee = search.assignee
    if (
      typeof search.sort === "string" &&
      SORT_VALUES.includes(search.sort as SortKey)
    ) {
      out.sort = search.sort as SortKey
    }
    if (typeof search.sprint === "string") out.sprint = search.sprint
    if (typeof search.tags === "string" && search.tags.length > 0) {
      out.tags = search.tags
    }
    return out
  }
})

function TicketsTab() {
  const { orgSlug, slug } = Route.useParams()
  const project = useProject()
  const sprintMembership = useAtomValue(
    sprintMembershipAtom(projectKey(orgSlug, slug))
  )
  return (
    <PageContainer>
      <TicketListUrlSync orgSlug={orgSlug} slug={slug} />
      <TicketList
        orgSlug={orgSlug}
        slug={slug}
        members={project.members}
        sprintMembership={sprintMembership}
        showSprintFilter
      />
    </PageContainer>
  )
}

function TicketListUrlSync({
  orgSlug,
  slug
}: {
  orgSlug: string
  slug: string
}) {
  const key = ticketListUiKey(orgSlug, slug)
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const [query, setQuery] = useAtom(queryAtom(key))
  const [status, setStatus] = useAtom(statusFilterAtom(key))
  const [type, setType] = useAtom(typeFilterAtom(key))
  const [assignee, setAssignee] = useAtom(assigneeFilterAtom(key))
  const [tags, setTags] = useAtom(selectedTagsAtom(key))
  const [sprint, setSprint] = useAtom(sprintFilterAtom(key))
  const [sort, setSort] = useAtom(sortKeyAtom(key))

  const lastWrittenRef = useRef<string>("")

  useEffect(() => {
    const incomingTags = parseTags(search.tags)
    const tagsEqual =
      incomingTags.length === tags.length &&
      incomingTags.every((t, i) => t === tags[i])
    const nextQuery = search.q ?? ""
    const nextStatus = search.status ?? "all"
    const nextType = search.type ?? "all"
    const nextAssignee = search.assignee ?? "all"
    const nextSprint = (search.sprint ?? "all") as SprintFilter
    const nextSort = search.sort ?? "id"
    if (nextQuery !== query) setQuery(nextQuery)
    if (nextStatus !== status) setStatus(nextStatus)
    if (nextType !== type) setType(nextType)
    if (nextAssignee !== assignee) setAssignee(nextAssignee)
    if (!tagsEqual) setTags(incomingTags)
    if (nextSprint !== sprint) setSprint(nextSprint)
    if (nextSort !== sort) setSort(nextSort)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- one-way URL → state sync; including state in deps causes loops
  }, [
    search.q,
    search.status,
    search.type,
    search.assignee,
    search.tags,
    search.sprint,
    search.sort
  ])

  useEffect(() => {
    const tagsParam = tags.length > 0 ? tags.join(",") : undefined
    const payload = {
      q: query.length > 0 ? query : undefined,
      status: status === "all" ? undefined : status,
      type: type === "all" ? undefined : type,
      assignee: assignee === "all" ? undefined : assignee,
      tags: tagsParam,
      sprint: sprint === "all" ? undefined : sprint,
      sort: sort === "id" ? undefined : sort
    }
    const fingerprint = JSON.stringify(payload)
    if (fingerprint === lastWrittenRef.current) return
    lastWrittenRef.current = fingerprint
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, ...payload }),
      replace: true
    })
  }, [query, status, type, assignee, tags, sprint, sort, navigate])

  return null
}
