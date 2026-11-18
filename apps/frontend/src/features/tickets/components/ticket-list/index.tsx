import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { GroupId, Member, TicketListQuery } from "@pp/shared"
import { ListHoverScope } from "@pp/ui/list-row"
import * as Equal from "effect/Equal"
import * as Option from "effect/Option"
import * as Result from "effect/reactivity/AsyncResult"
import { Activity, useState, type ReactNode } from "react"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  backlog,
  backlogRequest,
  type BacklogRequest,
  type BacklogValue
} from "@/features/tickets/atoms/backlog"
import { TicketViewSourceContext } from "@/features/tickets/hooks/ticketViewSource"
import { viewQuery } from "@/features/tickets/lib/ticketRows"
import { ticketSearchFromQuery } from "@/features/tickets/lib/ticketSearch"

import { BacklogTicketCreator } from "./BacklogTicketCreator"
import { SegmentedList } from "./SegmentedList"
import { useDeferredOnRequestChange } from "./useDeferredOnRequestChange"
import { useSubTicketsSettled } from "./useSubTicketsSettled"

type TicketListProps = Readonly<{
  query: TicketListQuery
  members: ReadonlyArray<Member>
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
  empty?: ReactNode
  sprint?: GroupId
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
      {creator ?? <BacklogTicketCreator query={props.query} />}
      <div className="flex flex-col gap-3">
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
  const statusShown = useShownOnce(!showSections)
  const sectionsShown = useShownOnce(showSections)
  const statusSections = <StatusSections {...props} />
  // One gliding hover across every section's rows.
  return (
    <ListHoverScope>
      {sections ? (
        <>
          <Activity mode={showSections ? "hidden" : "visible"}>
            {statusShown && statusSections}
          </Activity>
          <Activity mode={showSections ? "visible" : "hidden"}>
            {sectionsShown && sections}
          </Activity>
        </>
      ) : (
        statusSections
      )}
    </ListHoverScope>
  )
}

function useShownOnce(visible: boolean) {
  const [shown, setShown] = useState(visible)
  if (visible && !shown) setShown(true)
  return shown || visible
}

function StatusSections({
  query,
  members,
  alternate,
  showAlternate = false,
  empty,
  sprint
}: Omit<TicketListProps, "creator" | "toolbar" | "sections">) {
  const { orgSlug, slug } = useProjectRoute()
  const req = backlogRequest(orgSlug, slug, query)
  const result = useAtomValue(backlog(req))
  const refresh = useAtomRefresh(backlog(req))
  const [previous, setPrevious] = useState<{
    req: BacklogRequest
    query: TicketListQuery
    value: BacklogValue
  } | null>(null)
  const subTicketsSettled = useSubTicketsSettled(
    Result.isSuccess(result) ? result.value : null,
    query.status,
    showAlternate
  )
  const current =
    Result.isSuccess(result) && subTicketsSettled ? result.value : null
  if (
    current !== null &&
    (!Equal.equals(previous?.req, req) || previous?.value !== current)
  ) {
    setPrevious({ req, query, value: current })
  }
  const retainedResult = useAtomValue(backlog(previous?.req ?? req))
  const latest = current
    ? { req, query, value: current }
    : Result.isFailure(result) && !Equal.equals(previous?.req, req)
      ? null
      : previous && {
          ...previous,
          value: Option.getOrElse(
            Result.value(retainedResult),
            () => previous.value
          )
        }
  const active = useDeferredOnRequestChange(latest)
  const renderSections = () =>
    active ? (
      <TicketViewSourceContext
        value={{
          ...ticketSearchFromQuery(viewQuery(active.query)),
          from: "sections",
          group: "status",
          sprint
        }}
      >
        <Activity mode={showAlternate ? "hidden" : "visible"}>
          <SegmentedList
            key={`${orgSlug}/${slug}`}
            query={active.query}
            members={members}
            snapshot={active.value}
            empty={empty}
          />
        </Activity>
        {alternate && (
          <Activity mode={showAlternate ? "visible" : "hidden"}>
            {alternate({
              key: `${orgSlug}/${slug}`,
              query: active.query,
              snapshot: active.value
            })}
          </Activity>
        )}
      </TicketViewSourceContext>
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
    <div
      aria-busy={
        result.waiting || Result.isInitial(result) || !subTicketsSettled
      }
    >
      {Result.matchWithError(result, {
        onInitial: renderSections,
        onError: renderFailure,
        onDefect: renderFailure,
        onSuccess: renderSections
      })}
    </div>
  )
}
