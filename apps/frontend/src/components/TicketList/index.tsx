import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type {
  Group,
  Member,
  Ticket,
  TicketId,
  TicketListQuery
} from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { Activity, useMemo, useState, type ReactNode } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import {
  backlog,
  backlogRequest,
  encodeTicketListQuery,
  type BacklogRequest,
  type BacklogValue
} from "@/features/tickets/atoms/backlog"

import { BacklogTicketCreator } from "./BacklogTicketCreator"
import { SegmentedList } from "./SegmentedList"

type TicketListProps = Readonly<{
  orgSlug: string
  slug: string
  query: TicketListQuery
  members: ReadonlyArray<Member>
  extraRowActions?: (ticket: Ticket) => ReactNode
  sprintMembership?: ReadonlyMap<TicketId, Group>
  creator?: ReactNode
  toolbar: ReactNode
  sections?: ReactNode
  showSections?: boolean
  alternate?: (args: {
    key: string
    query: TicketListQuery
    snapshot: BacklogValue
  }) => ReactNode
  showAlternate?: boolean
}>

export function TicketList({
  creator,
  toolbar,
  sections,
  showSections = false,
  ...props
}: TicketListProps) {
  return (
    <div className="group/list flex flex-col gap-3">
      {creator ?? (
        <BacklogTicketCreator
          orgSlug={props.orgSlug}
          slug={props.slug}
          query={props.query}
        />
      )}
      <div className="flex flex-col gap-3 transition-opacity duration-200 ease-out group-has-[form[data-active]]/list:opacity-35">
        {toolbar}
        <TicketListContent
          {...props}
          sections={sections}
          showSections={showSections}
        />
      </div>
    </div>
  )
}

export function TicketListContent({
  sections,
  showSections = false,
  ...props
}: Omit<TicketListProps, "creator" | "toolbar">) {
  const statusSections = <StatusSections {...props} />
  return sections ? (
    <>
      <Activity mode={showSections ? "hidden" : "visible"}>
        {statusSections}
      </Activity>
      <Activity mode={showSections ? "visible" : "hidden"}>{sections}</Activity>
    </>
  ) : (
    statusSections
  )
}

function StatusSections({
  orgSlug,
  slug,
  query,
  members,
  extraRowActions,
  sprintMembership,
  alternate,
  showAlternate = false
}: Omit<TicketListProps, "creator" | "toolbar" | "sections">) {
  const req = useMemo(
    () => backlogRequest(orgSlug, slug, query),
    [orgSlug, slug, query]
  )
  const result = useAtomValue(backlog(req))
  const refresh = useAtomRefresh(backlog(req))
  const [previous, setPrevious] = useState<{
    req: BacklogRequest
    query: TicketListQuery
    value: BacklogValue
  } | null>(null)
  if (
    Result.isSuccess(result) &&
    (previous?.req !== req || previous.value !== result.value)
  ) {
    setPrevious({ req, query, value: result.value })
  }
  const active = Result.isSuccess(result)
    ? { req, query, value: result.value }
    : Result.isFailure(result) && previous?.req !== req
      ? null
      : previous
  const renderSections = () =>
    active ? (
      <>
        <Activity mode={showAlternate ? "hidden" : "visible"}>
          <SegmentedList
            key={`${orgSlug}/${slug}`}
            orgSlug={orgSlug}
            slug={slug}
            query={active.query}
            members={members}
            snapshot={active.value}
            extraRowActions={extraRowActions}
            sprintMembership={sprintMembership}
          />
        </Activity>
        {alternate && (
          <Activity mode={showAlternate ? "visible" : "hidden"}>
            {alternate({
              key: `${orgSlug}/${slug}/${encodeTicketListQuery(active.query)}`,
              query: active.query,
              snapshot: active.value
            })}
          </Activity>
        )}
      </>
    ) : (
      <div
        aria-busy="true"
        className="h-96 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none"
      />
    )

  const renderFailure = (error: unknown) => (
    <>
      <ErrorPage error={error} reset={refresh} contained />
      {active && renderSections()}
    </>
  )

  return (
    <div aria-busy={result.waiting || Result.isInitial(result)}>
      {Result.matchWithError(result, {
        onInitial: renderSections,
        onError: renderFailure,
        onDefect: renderFailure,
        onSuccess: renderSections
      })}
    </div>
  )
}
