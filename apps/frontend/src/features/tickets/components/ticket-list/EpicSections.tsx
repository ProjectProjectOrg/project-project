import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  EPIC_SECTION_NONE,
  type EpicSectionKey,
  type Member,
  type TicketId,
  type TicketListQuery,
  TicketStatus
} from "@pp/shared"
import * as Equal from "effect/Equal"
import * as Option from "effect/Option"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { Inbox } from "lucide-react"
import { useState } from "react"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { encodeTicketListQuery } from "@/features/tickets/atoms/backlog"
import {
  epicSections,
  epicSectionsRequest,
  epicSectionsTicketUpdates,
  loadMoreEpicSections,
  type EpicSectionsRequest
} from "@/features/tickets/atoms/epicSections"
import type {
  EpicSectionsValue,
  EpicSectionValue
} from "@/features/tickets/lib/epicSectionRows"
import { TYPE_META } from "@/features/tickets/lib/ticketMeta"
import { m } from "@/paraglide/messages"

import { epicCollapseKey, useCollapsedInRecord } from "./sectionCollapse"
import {
  CreatingSectionsProvider,
  SectionList,
  TicketPagination
} from "./SectionList"
import { queryHasActiveFilter } from "./SprintSections"
import { useTicketPreview } from "./useTicketPreview"

const defaultCreateStatus = Schema.decodeSync(TicketStatus)("todo")
const EpicIcon = TYPE_META.epic.icon

type Props = Readonly<{
  preferencesKey: string
  query: TicketListQuery
  members: ReadonlyArray<Member>
}>

export function EpicSections(props: Props) {
  const { orgSlug, slug } = useProjectRoute()
  const persistKey = epicCollapseKey(props.preferencesKey)
  const snapshotReq = epicSectionsRequest(orgSlug, slug, props.query)
  const preview = useTicketPreview()
  const snapshotResult = useAtomValue(epicSections(snapshotReq))
  const refresh = useAtomRefresh(epicSections(snapshotReq))
  const [previous, setPrevious] = useState<Readonly<{
    req: EpicSectionsRequest
    query: TicketListQuery
    value: EpicSectionsValue
  }> | null>(null)
  if (
    Result.isSuccess(snapshotResult) &&
    (!Equal.equals(previous?.req, snapshotReq) ||
      previous?.value !== snapshotResult.value)
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
    : previous?.req.params.orgSlug === orgSlug &&
        previous.req.params.slug === slug &&
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
      <div style={{ overflowAnchor: "none" }} className="flex flex-col gap-1">
        <CreatingSectionsProvider>
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
        </CreatingSectionsProvider>
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
    snapshotReq: EpicSectionsRequest
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
  const query: TicketListQuery = {
    ...props.query,
    parent: [section.key],
    cursor: undefined
  }
  const selectedStatuses = query.status
  return (
    <div aria-busy={waiting}>
      <SectionList
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
        update={epicSectionsTicketUpdates(snapshotReq)}
        snapshotReq={snapshotReq}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        members={props.members}
        activePreviewId={activePreviewId}
        onPreviewPointerEnter={onPreviewPointerEnter}
        onPreviewOpenChange={onPreviewOpenChange}
      />
    </div>
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
  req: EpicSectionsRequest
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
