import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
  type ComponentProps
} from "react"
import { useAtomRefresh, useAtomValue, useAtomSet } from "@effect/atom-react"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { Inbox } from "lucide-react"
import {
  sprintSectionKey,
  sprintState,
  type Group,
  type Member,
  type Ticket,
  type TicketId,
  type TicketListQuery,
  TicketStatus
} from "@projectproject/shared"
import {
  encodeTicketListQuery,
  type BacklogRequest,
  type BacklogSection
} from "@/atoms/backlog"
import { sprintList, sprintListRequest } from "@/atoms/sprintList"
import {
  loadMoreSprintSections,
  sprintSections,
  sprintSectionsRequest,
  updateSprintSectionsTicket,
  type SprintSectionsValue
} from "@/atoms/sprintSections"
import { backlogSprintSections } from "./sprintGrouping"
import { ErrorPage } from "@/components/ErrorPage"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"
import { Row } from "./Row"
import { SectionList, TicketPagination } from "./SectionList"
import { SprintStateIcon } from "@/components/sprints/SprintChip"
import { sprintCollapseKey, useCollapsedInRecord } from "./sectionCollapse"

const defaultCreateStatus = Schema.decodeSync(TicketStatus)("todo")
const EMPTY_PAGE: BacklogSection = { items: [], nextCursor: null }

type Props = Readonly<{
  preferencesKey: string
  orgSlug: string
  slug: string
  query: TicketListQuery
  members: ReadonlyArray<Member>
  extraRowActions: (ticket: Ticket) => ReactNode
}>

const queryHasActiveFilter = (query: TicketListQuery) =>
  (query.q !== undefined && query.q.length > 0) ||
  (query.status?.length ?? 0) > 0 ||
  (query.type?.length ?? 0) > 0 ||
  (query.assignee?.length ?? 0) > 0 ||
  (query.tags?.length ?? 0) > 0 ||
  (query.groupId?.length ?? 0) > 0 ||
  query.hasBranch !== undefined ||
  query.hasPr !== undefined ||
  query.updatedAfter !== undefined ||
  query.archived !== undefined

export function SprintSections(props: Props) {
  const persistKey = sprintCollapseKey(props.preferencesKey)
  const groupsReq = useMemo(
    () => sprintListRequest(props.orgSlug, props.slug),
    [props.orgSlug, props.slug]
  )
  const snapshotReq = useMemo(
    () => sprintSectionsRequest(props.orgSlug, props.slug, props.query),
    [props.orgSlug, props.slug, props.query]
  )
  const [preview, setPreview] = useState<TicketId | null>(null)
  const onPreviewPointerEnter = useCallback(
    (id: TicketId) =>
      setPreview((current) => (current === id ? current : null)),
    []
  )
  const onPreviewOpenChange = useCallback(
    (id: TicketId, open: boolean) =>
      setPreview((current) => (open ? id : current === id ? null : current)),
    []
  )
  const groupsResult = useAtomValue(sprintList(groupsReq))
  const snapshotResult = useAtomValue(sprintSections(snapshotReq))
  const refreshGroups = useAtomRefresh(sprintList(groupsReq))
  const refreshSnapshot = useAtomRefresh(sprintSections(snapshotReq))
  const groups = Option.getOrUndefined(Result.value(groupsResult))
  const snapshot = Option.getOrUndefined(Result.value(snapshotResult))
  const waiting = groupsResult.waiting || snapshotResult.waiting
  const renderSections = () =>
    groups && snapshot ? (
      <div
        style={{ overflowAnchor: "none" }}
        className="flex flex-col gap-1 has-[[data-creating]]:[&>:not(:has([data-creating]))]:opacity-35"
      >
        {backlogSprintSections(groups, props.query.groupId).map((sprint) => {
          const id = sprintSectionKey(sprint?.id ?? null)
          const section = snapshot.sections.find((entry) => entry.key === id)
          return (
            <SprintSection
              key={id}
              {...props}
              persistKey={persistKey}
              snapshotReq={snapshotReq}
              sprint={sprint}
              page={section?.page ?? EMPTY_PAGE}
              count={section?.count ?? 0}
              waiting={waiting}
              activePreviewId={preview}
              onPreviewPointerEnter={onPreviewPointerEnter}
              onPreviewOpenChange={onPreviewOpenChange}
            />
          )
        })}
      </div>
    ) : (
      <div
        aria-busy="true"
        className="h-32 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none"
      />
    )
  const refresh = () => {
    refreshGroups()
    refreshSnapshot()
  }
  const renderFailure = (error: unknown) => (
    <>
      <ErrorPage error={error} reset={refresh} contained />
      {groups && snapshot && renderSections()}
    </>
  )
  return Result.matchWithError(groupsResult, {
    onInitial: renderSections,
    onError: renderFailure,
    onDefect: renderFailure,
    onSuccess: () =>
      Result.matchWithError(snapshotResult, {
        onInitial: renderSections,
        onError: renderFailure,
        onDefect: renderFailure,
        onSuccess: renderSections
      })
  })
}

type SprintSectionProps = Props &
  Readonly<{
    persistKey: string
    snapshotReq: BacklogRequest
    sprint: Group | null
    page: BacklogSection
    count: number
    waiting: boolean
    activePreviewId: TicketId | null
    onPreviewPointerEnter: (id: TicketId) => void
    onPreviewOpenChange: (id: TicketId, open: boolean) => void
  }>

function SprintSection({
  persistKey,
  snapshotReq,
  sprint,
  page,
  count,
  waiting,
  activePreviewId,
  onPreviewPointerEnter,
  onPreviewOpenChange,
  ...props
}: SprintSectionProps) {
  const id = sprintSectionKey(sprint?.id ?? null)
  const [collapsed, onToggleCollapsed] = useCollapsedInRecord(
    persistKey,
    id,
    props.query.q,
    !props.query.q && sprint !== null && sprintState(sprint) !== "planned"
  )
  const { orgSlug, slug, members, extraRowActions } = props
  const query = {
    ...props.query,
    groupId: [sprint?.id ?? "ungrouped"] as TicketListQuery["groupId"],
    cursor: undefined
  }
  const listKey = encodeTicketListQuery(query)
  const label = sprint?.name ?? m.tickets_grouping_unscheduled()
  const state = sprint ? sprintState(sprint) : null
  const stateLabel =
    state === "planned"
      ? m.tickets_grouping_planned()
      : state === "active"
        ? m.tickets_grouping_active()
        : m.tickets_grouping_completed()
  const dates =
    sprint &&
    [sprint.startsAt, sprint.endsAt]
      .filter((date): date is Date => date !== null)
      .map((date) =>
        new Intl.DateTimeFormat(getLocale(), {
          month: "short",
          day: "numeric"
        }).format(date)
      )
      .join(" – ")
  const selectedStatuses = query.status
  return (
    <div aria-busy={waiting}>
      <SectionList
        listKey={listKey}
        orgSlug={orgSlug}
        slug={slug}
        query={query}
        status={
          selectedStatuses?.length === 1
            ? selectedStatuses[0]
            : defaultCreateStatus
        }
        statuses={[]}
        heading={{
          label,
          icon: sprint ? (
            <SprintStateIcon sprint={sprint} size="md" />
          ) : (
            <Inbox
              className="size-4 text-muted-foreground"
              strokeWidth={1.75}
            />
          ),
          detail: sprint
            ? [stateLabel, dates].filter(Boolean).join(" · ")
            : undefined
        }}
        canCreate={state !== "completed"}
        emptyMessage={
          queryHasActiveFilter(props.query)
            ? m.tickets_no_filter_matches()
            : undefined
        }
        count={count}
        page={page}
        pagination={
          <SprintSectionPagination
            req={snapshotReq}
            sectionKey={id}
            count={count}
            loaded={page.items.length}
            nextCursor={page.nextCursor}
            collapsed={collapsed}
          />
        }
        rowComponent={(rowProps) => (
          <SprintRow {...rowProps} snapshotReq={snapshotReq} />
        )}
        creationVariant="flat"
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        members={members}
        sprintMembership={
          sprint ? new Map(sprint.tickets.map((id) => [id, sprint])) : undefined
        }
        extraRowActions={extraRowActions}
        showSprintCol
        showExtraActionsCol
        activePreviewId={activePreviewId}
        onPreviewPointerEnter={onPreviewPointerEnter}
        onPreviewOpenChange={onPreviewOpenChange}
      />
    </div>
  )
}

function SprintRow({
  snapshotReq,
  ...props
}: ComponentProps<typeof Row> & { snapshotReq: BacklogRequest }) {
  const update = useAtomSet(
    updateSprintSectionsTicket({ req: snapshotReq, id: props.ticket.id })
  )
  const state = useAtomValue(
    updateSprintSectionsTicket({ req: snapshotReq, id: props.ticket.id })
  )
  return (
    <>
      <Row {...props} onUpdate={update} />
      {Result.matchWithError(state, {
        onInitial: () => null,
        onSuccess: () => null,
        onError: (error) => (
          <div className="col-span-full">
            <ErrorPage error={error} contained />
          </div>
        ),
        onDefect: (error) => (
          <div className="col-span-full">
            <ErrorPage error={error} contained />
          </div>
        )
      })}
    </>
  )
}

function SprintSectionPagination({
  req,
  sectionKey,
  count,
  loaded,
  nextCursor,
  collapsed
}: {
  req: BacklogRequest
  sectionKey: SprintSectionsValue["sections"][number]["key"]
  count: number
  loaded: number
  nextCursor: string | null
  collapsed: boolean
}) {
  const loadMore = useAtomSet(loadMoreSprintSections({ req, key: sectionKey }))
  const state = useAtomValue(loadMoreSprintSections({ req, key: sectionKey }))
  return (
    <TicketPagination
      nextCursor={nextCursor}
      remaining={Math.max(0, count - loaded)}
      collapsed={collapsed}
      loadingMore={state.waiting}
      failed={Result.isFailure(state)}
      loadMore={() => loadMore()}
    />
  )
}
