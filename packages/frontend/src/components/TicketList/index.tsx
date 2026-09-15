import { useMemo, useState, type ReactNode } from "react"
import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import {
  backlog,
  backlogRequest,
  type BacklogRequest,
  type BacklogValue
} from "@/atoms/backlog"
import { ErrorPage } from "@/components/ErrorPage"
import { BacklogTicketCreator } from "./BacklogTicketCreator"
import { SegmentedList } from "./SegmentedList"
import type {
  Group,
  Member,
  Ticket,
  TicketId,
  TicketListQuery
} from "@projectproject/shared"

export function TicketList({
  orgSlug,
  slug,
  query,
  members,
  extraRowActions,
  sprintMembership,
  creator,
  toolbar
}: {
  orgSlug: string
  slug: string
  query: TicketListQuery
  members: ReadonlyArray<Member>
  extraRowActions?: (ticket: Ticket) => ReactNode
  sprintMembership?: ReadonlyMap<TicketId, Group>
  creator?: ReactNode
  toolbar: ReactNode
}) {
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
      <SegmentedList
        key={`${orgSlug}/${slug}/${JSON.stringify(active.query)}`}
        orgSlug={orgSlug}
        slug={slug}
        query={active.query}
        snapshot={active.value}
        members={members}
        extraRowActions={extraRowActions}
        sprintMembership={sprintMembership}
      />
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
    <div className="group/list flex flex-col gap-3">
      {creator ?? (
        <BacklogTicketCreator orgSlug={orgSlug} slug={slug} query={query} />
      )}

      <div className="flex flex-col gap-3 transition-opacity duration-200 ease-out group-has-[form[data-active]]/list:opacity-35">
        {toolbar}

        <div
          aria-busy={result.waiting || Result.isInitial(result)}
          className={
            !Result.isFailure(result) && result.waiting && active
              ? "animate-pulse motion-reduce:animate-none"
              : undefined
          }
        >
          {Result.matchWithError(result, {
            onInitial: renderSections,
            onError: renderFailure,
            onDefect: renderFailure,
            onSuccess: renderSections
          })}
        </div>
      </div>
    </div>
  )
}
