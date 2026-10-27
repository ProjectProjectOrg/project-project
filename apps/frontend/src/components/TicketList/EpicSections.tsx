import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  EPIC_SECTION_NONE,
  TicketStatus,
  type EpicSectionKey,
  type Member,
  type TicketId,
  type TicketListQuery
} from "@pp/shared"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { Inbox } from "lucide-react"
import { useState, useMemo, type ComponentProps } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import { me } from "@/features/auth/atoms/auth"
import {
  encodeTicketListQuery,
  type BacklogRequest
} from "@/features/tickets/atoms/backlog"
import {
  epicSections,
  epicSectionsRequest,
  loadMoreEpicSections,
  updateEpicSectionsTicket,
  type EpicSectionsValue,
  type EpicSectionValue
} from "@/features/tickets/atoms/epicSections"
import { TYPE_META } from "@/lib/ticket-meta"
import { m } from "@/paraglide/messages"

import { Row } from "./Row"
import { epicCollapseKey, useCollapsedInRecord } from "./sectionCollapse"
import { SectionList, TicketPagination } from "./SectionList"
import { queryHasActiveFilter } from "./SprintSections"
import { useTicketPreview } from "./useTicketPreview"

const defaultCreateStatus = Schema.decodeSync(TicketStatus)("todo")
const EpicIcon = TYPE_META.epic.icon

type Props = Readonly<{
  preferencesKey: string
  orgSlug: string
  slug: string
  query: TicketListQuery
  members: ReadonlyArray<Member>
}>

export function EpicSections(props: Props) {
  const persistKey = epicCollapseKey(props.preferencesKey)
  const snapshotReq = useMemo(
    () => epicSectionsRequest(props.orgSlug, props.slug, props.query),
    [props.orgSlug, props.slug, props.query]
  )
  const preview = useTicketPreview()
  const snapshotResult = useAtomValue(epicSections(snapshotReq))
  const refresh = useAtomRefresh(epicSections(snapshotReq))
  const [previous, setPrevious] = useState<Readonly<{
    req: BacklogRequest
    query: TicketListQuery
    value: EpicSectionsValue
  }> | null>(null)
  if (
    Result.isSuccess(snapshotResult) &&
    (previous?.req !== snapshotReq || previous.value !== snapshotResult.value)
  ) {
    setPrevious({
      req: snapshotReq,
      query: props.query,
      value: snapshotResult.value
    })
  }
  const retainedResult = useAtomValue(
    epicSections(previous?.req ?? snapshotReq)
  )
  const active = Result.isSuccess(snapshotResult)
    ? { req: snapshotReq, query: props.query, value: snapshotResult.value }
    : previous?.req.params.orgSlug === props.orgSlug &&
        previous.req.params.slug === props.slug &&
        !Result.isFailure(snapshotResult)
      ? {
          ...previous,
          value: Option.getOrElse(
            Result.value(retainedResult),
            () => previous.value
          )
        }
      : null
  const renderSections = () =>
    active ? (
      <div
        style={{ overflowAnchor: "none" }}
        className="flex flex-col gap-1 has-[[data-creating]]:[&>:not(:has([data-creating]))]:opacity-35"
      >
        {active.value.sections.map((section) => (
          <EpicSection
            key={section.key}
            {...props}
            persistKey={persistKey}
            query={active.query}
            snapshotReq={active.req}
            section={section}
            waiting={snapshotResult.waiting}
            activePreviewId={preview.activePreviewId}
            onPreviewPointerEnter={preview.onPreviewPointerEnter}
            onPreviewOpenChange={preview.onPreviewOpenChange}
          />
        ))}
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
      {active && renderSections()}
    </>
  )
  return Result.matchWithError(snapshotResult, {
    onInitial: renderSections,
    onError: renderFailure,
    onDefect: renderFailure,
    onSuccess: renderSections
  })
}

type EpicSectionProps = Props &
  Readonly<{
    persistKey: string
    snapshotReq: BacklogRequest
    section: EpicSectionValue
    waiting: boolean
    activePreviewId: TicketId | null
    onPreviewPointerEnter: (id: TicketId) => void
    onPreviewOpenChange: (id: TicketId, open: boolean) => void
  }>

function EpicSection({
  persistKey,
  snapshotReq,
  section,
  waiting,
  activePreviewId,
  onPreviewPointerEnter,
  onPreviewOpenChange,
  ...props
}: EpicSectionProps) {
  const [collapsed, onToggleCollapsed] = useCollapsedInRecord(
    persistKey,
    section.key,
    props.query.q,
    false
  )
  const { orgSlug, slug, members } = props
  const query: TicketListQuery = {
    ...props.query,
    parent: [section.key],
    cursor: undefined
  }
  const selectedStatuses = query.status
  return (
    <div aria-busy={waiting}>
      <SectionList
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
          label: section.title ?? m.tickets_grouping_no_epic(),
          icon:
            section.key === EPIC_SECTION_NONE ? (
              <Inbox
                className="size-4 text-muted-foreground"
                strokeWidth={1.75}
              />
            ) : (
              <EpicIcon
                className="size-4 text-muted-foreground"
                strokeWidth={1.75}
              />
            )
        }}
        emptyMessage={
          queryHasActiveFilter(props.query)
            ? m.tickets_no_filter_matches()
            : undefined
        }
        count={section.count}
        page={section.page}
        pagination={
          <EpicSectionPagination
            req={snapshotReq}
            sectionKey={section.key}
            count={section.count}
            loaded={section.page.items.length}
            nextCursor={section.page.nextCursor}
            collapsed={collapsed}
          />
        }
        renderRow={(rowProps) => (
          <EpicRow {...rowProps} snapshotReq={snapshotReq} />
        )}
        creationVariant="epic"
        snapshotReq={snapshotReq}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        members={members}
        activePreviewId={activePreviewId}
        onPreviewPointerEnter={onPreviewPointerEnter}
        onPreviewOpenChange={onPreviewOpenChange}
      />
    </div>
  )
}

function EpicRow({
  snapshotReq,
  ...props
}: ComponentProps<typeof Row> & Readonly<{ snapshotReq: BacklogRequest }>) {
  const viewer = useAtomValue(me())
  const viewerId = Result.isSuccess(viewer) ? viewer.value.id : undefined
  const mutation = updateEpicSectionsTicket({
    req: snapshotReq,
    id: props.ticket.id,
    viewerId
  })
  const update = useAtomSet(mutation)
  const state = useAtomValue(mutation)
  return (
    <>
      <Row {...props} showParent={false} onUpdate={update} />
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

function EpicSectionPagination({
  req,
  sectionKey,
  count,
  loaded,
  nextCursor,
  collapsed
}: Readonly<{
  req: BacklogRequest
  sectionKey: EpicSectionKey
  count: number
  loaded: number
  nextCursor: string | null
  collapsed: boolean
}>) {
  const loadMore = useAtomSet(loadMoreEpicSections({ req, key: sectionKey }))
  const state = useAtomValue(loadMoreEpicSections({ req, key: sectionKey }))
  return (
    <TicketPagination
      requestKey={`${req.params.orgSlug}/${req.params.slug}:${encodeTicketListQuery(req.query)}`}
      nextCursor={nextCursor}
      remaining={Math.max(0, count - loaded)}
      collapsed={collapsed}
      loadingMore={state.waiting}
      failed={Result.isFailure(state)}
      loadMore={() => loadMore()}
    />
  )
}
