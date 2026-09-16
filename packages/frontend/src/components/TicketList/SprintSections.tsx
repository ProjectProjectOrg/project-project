import {
  useCallback,
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
  sprintState,
  type Group,
  type Member,
  type Ticket,
  type TicketId,
  type TicketListQuery,
  TicketStatus
} from "@projectproject/shared"
import {
  projectKey,
  sprintsListAtom,
  sprintsListBaseAtom
} from "@/atoms/sprints"
import {
  flatTicketsAtom,
  flatTicketsBaseAtom,
  loadMoreFlatTicketsAtom,
  flatTicketMutationKey,
  updateFlatTicketAtom,
  ticketsListKey
} from "@/atoms/tickets"
import { backlogSprintSections } from "./sprintGrouping"
import { useLocalStorageState } from "@/hooks/useLocalStorageState"
import { ErrorPage } from "@/components/ErrorPage"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"
import { cn } from "@/lib/utils"
import { queryHasActiveFilter } from "./url"
import { Row } from "./Row"
import { SectionList, TicketPagination } from "./SectionList"
import { SprintStateIcon } from "@/components/sprints/SprintChip"

const defaultCreateStatus = Schema.decodeSync(TicketStatus)("todo")
const CollapseSchema = Schema.Record(Schema.String, Schema.Boolean)
const EMPTY_COLLAPSE: Readonly<Record<string, boolean>> = {}

type Props = {
  preferencesKey: string
  orgSlug: string
  slug: string
  query: TicketListQuery
  members: ReadonlyArray<Member>
  extraRowActions: (ticket: Ticket) => ReactNode
}

export function SprintSections(props: Props) {
  const key = projectKey(props.orgSlug, props.slug)
  const [collapseOverrides, setCollapseOverrides] = useLocalStorageState(
    `projectproject:sprint-sections-collapsed:${props.preferencesKey}`,
    CollapseSchema,
    EMPTY_COLLAPSE
  )
  const [searchState, setSearchState] = useState({
    query: props.query.q,
    collapsed: EMPTY_COLLAPSE
  })
  const collapsed = props.query.q
    ? searchState.query === props.query.q
      ? searchState.collapsed
      : EMPTY_COLLAPSE
    : collapseOverrides
  const setCollapsed = (next: Readonly<Record<string, boolean>>) => {
    if (props.query.q) setSearchState({ query: props.query.q, collapsed: next })
    else setCollapseOverrides(next)
  }
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
  const result = useAtomValue(sprintsListAtom(key))
  const refresh = useAtomRefresh(sprintsListBaseAtom(key))
  const groups = Option.getOrUndefined(Result.value(result))
  const renderSections = () =>
    groups ? (
      <div
        style={{ overflowAnchor: "none" }}
        className="flex flex-col gap-1 has-[[data-creating]]:[&>:not(:has([data-creating]))]:opacity-35"
      >
        {backlogSprintSections(groups, props.query.filter?.groupId).map(
          (sprint) => {
            const id = sprint?.id ?? "unscheduled"
            const isCollapsed =
              collapsed[id] ??
              (!props.query.q &&
                sprint !== null &&
                sprintState(sprint) !== "planned")
            return (
              <SprintSection
                key={id}
                {...props}
                sprint={sprint}
                collapsed={isCollapsed}
                onToggleCollapsed={() =>
                  setCollapsed({ ...collapsed, [id]: !isCollapsed })
                }
                activePreviewId={preview}
                onPreviewPointerEnter={onPreviewPointerEnter}
                onPreviewOpenChange={onPreviewOpenChange}
              />
            )
          }
        )}
      </div>
    ) : (
      <div
        aria-busy="true"
        className="h-32 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none"
      />
    )
  const renderFailure = (error: unknown) => (
    <>
      <ErrorPage error={error} reset={refresh} contained />
      {groups && renderSections()}
    </>
  )
  return Result.matchWithError(result, {
    onInitial: renderSections,
    onError: renderFailure,
    onDefect: renderFailure,
    onSuccess: renderSections
  })
}

type SprintSectionProps = Props & {
  sprint: Group | null
  collapsed: boolean
  onToggleCollapsed: () => void
  activePreviewId: TicketId | null
  onPreviewPointerEnter: (id: TicketId) => void
  onPreviewOpenChange: (id: TicketId, open: boolean) => void
}

function SprintSection({
  sprint,
  collapsed,
  onToggleCollapsed,
  activePreviewId,
  onPreviewPointerEnter,
  onPreviewOpenChange,
  ...props
}: SprintSectionProps) {
  const { orgSlug, slug, members, extraRowActions } = props
  const query: TicketListQuery = {
    ...props.query,
    filter: { ...props.query.filter, groupId: [sprint?.id ?? null] },
    cursor: undefined
  }
  const key = ticketsListKey(orgSlug, slug, query)
  const result = useAtomValue(flatTicketsAtom(key))
  const refresh = useAtomRefresh(flatTicketsBaseAtom(key))
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
  const selectedStatuses = query.filter?.status
  const active = Option.getOrUndefined(Result.value(result))
  const renderSection = () =>
    active ? (
      <SectionList
        listKey={key}
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
        count={active.count}
        page={active}
        pagination={
          <FlatSectionPagination
            listKey={key}
            count={active.count}
            loaded={active.items.length}
            nextCursor={active.nextCursor}
            collapsed={collapsed}
          />
        }
        rowComponent={FlatRow}
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
    ) : (
      <div
        aria-busy="true"
        className="h-16 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none"
      />
    )
  const renderFailure = (error: unknown) => (
    <>
      <ErrorPage error={error} reset={refresh} contained />
      {active && renderSection()}
    </>
  )
  return (
    <div
      aria-busy={result.waiting || Result.isInitial(result)}
      className={cn(
        result.waiting && "animate-pulse motion-reduce:animate-none"
      )}
    >
      {Result.matchWithError(result, {
        onInitial: renderSection,
        onError: renderFailure,
        onDefect: renderFailure,
        onSuccess: renderSection
      })}
    </div>
  )
}

function FlatRow(props: ComponentProps<typeof Row>) {
  const key = flatTicketMutationKey(
    ticketsListKey(props.orgSlug, props.slug, props.query),
    props.ticket.id
  )
  const update = useAtomSet(updateFlatTicketAtom(key))
  const state = useAtomValue(updateFlatTicketAtom(key))
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

function FlatSectionPagination({
  listKey,
  count,
  loaded,
  nextCursor,
  collapsed
}: {
  listKey: string
  count: number
  loaded: number
  nextCursor: string | null
  collapsed: boolean
}) {
  const loadMore = useAtomSet(loadMoreFlatTicketsAtom(listKey))
  const state = useAtomValue(loadMoreFlatTicketsAtom(listKey))
  const refresh = useAtomRefresh(flatTicketsBaseAtom(listKey))
  return (
    <TicketPagination
      nextCursor={nextCursor}
      remaining={Math.max(0, count - loaded)}
      collapsed={collapsed}
      loadingMore={state.waiting}
      failed={Result.isFailure(state)}
      loadMore={() => (Result.isFailure(state) ? refresh() : loadMore())}
    />
  )
}
