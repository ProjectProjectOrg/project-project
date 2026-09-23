import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { ArrowRight } from "lucide-react"
import { useState, type ReactNode } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import { ProjectTile } from "@/components/ProjectTile"
import { SectionBody } from "@/components/TicketList/SectionBody"
import { useCollapsedInSet } from "@/components/TicketList/sectionCollapse"
import {
  SectionHeader,
  type SectionHeading
} from "@/components/TicketList/SectionHeader"
import { useTicketPreview } from "@/components/TicketList/useTicketPreview"
import { Button } from "@/components/ui/button"
import {
  myTicketBoard,
  myTicketsByProject,
  updateMyTicket,
  updateProjectTicket,
  type OrgTicket,
  type OrgTicketsRequest,
  type ProjectTicketGroup
} from "@/features/tickets/atoms/myTickets"
import { getStatusIcon } from "@/lib/status-icons"
import { m } from "@/paraglide/messages"

import {
  DashboardRows,
  type OrgTicketUpdate,
  type TicketPreview
} from "./DashboardTicket"
import {
  COMPACT_TICKET_LIMIT,
  MyTicketsPagination,
  RevealMoreButton
} from "./MyTicketsPagination"

export type DashboardGrouping = "project" | "status" | "none"

type GroupedListProps = Readonly<{
  req: OrgTicketsRequest
  collapseKey: string
  loading: ReactNode
  empty: ReactNode
}>

type Group = Readonly<{
  id: string
  heading: SectionHeading
  count: number
  tickets: ReadonlyArray<OrgTicket>
  footer?: ReactNode
  expandable?: Readonly<{ pagination: ReactNode }>
}>

export function ProjectGroupedList(props: GroupedListProps) {
  const { req } = props
  const result = useAtomValue(myTicketsByProject(req))
  const refresh = useAtomRefresh(myTicketsByProject(req))
  return Result.matchWithError(result, {
    onInitial: () => props.loading,
    onError: (error) => <ErrorPage error={error} reset={refresh} contained />,
    onDefect: (defect) => (
      <ErrorPage error={defect} reset={refresh} contained />
    ),
    onSuccess: ({ value }) => (
      <GroupedSections
        {...props}
        update={updateProjectTicket}
        groups={value.groups.map((group) => ({
          id: group.project.slug,
          heading: {
            label: group.project.name,
            icon: (
              <ProjectTile
                orgSlug={req.params.orgSlug}
                icon={group.project.icon}
                iconImage={group.project.iconImage}
                color={group.project.color}
                size="xs"
                seed={group.project.slug}
              />
            )
          },
          count: group.total,
          tickets: group.tickets,
          footer:
            group.total > group.tickets.length ? (
              <ViewAllInProject orgSlug={req.params.orgSlug} group={group} />
            ) : undefined
        }))}
      />
    )
  })
}

export function StatusGroupedList(props: GroupedListProps) {
  const { req } = props
  const result = useAtomValue(myTicketBoard(req))
  const refresh = useAtomRefresh(myTicketBoard(req))
  return Result.matchWithError(result, {
    onInitial: () => props.loading,
    onError: (error) => <ErrorPage error={error} reset={refresh} contained />,
    onDefect: (defect) => (
      <ErrorPage error={defect} reset={refresh} contained />
    ),
    onSuccess: ({ value }) => (
      <GroupedSections
        {...props}
        update={updateMyTicket}
        groups={value.columns.map((column) => {
          const Icon = getStatusIcon(column.icon)
          return {
            id: column.key,
            heading: {
              label: column.label,
              icon: (
                <Icon
                  className="size-4"
                  style={{ color: column.color }}
                  strokeWidth={1.75}
                />
              )
            },
            count: column.count,
            tickets: column.items,
            expandable: {
              pagination: (
                <MyTicketsPagination
                  req={req}
                  nextCursor={value.nextCursor}
                  loaded={value.columns.reduce(
                    (sum, candidate) => sum + candidate.items.length,
                    0
                  )}
                  total={value.total}
                />
              )
            }
          }
        })}
      />
    )
  })
}

function ViewAllInProject({
  orgSlug,
  group
}: Readonly<{ orgSlug: string; group: ProjectTicketGroup }>) {
  return (
    <div className="flex justify-center py-2">
      <Button
        variant="tertiary"
        size="sm"
        trailingIcon={ArrowRight}
        render={
          <Link
            to="/orgs/$orgSlug/projects/$slug"
            params={{ orgSlug, slug: group.project.slug }}
            search={{ assignee: ["mine"] }}
          />
        }
      >
        {m.org_dashboard_view_all_in_project({
          count: group.total,
          project: group.project.name
        })}
      </Button>
    </div>
  )
}

function GroupedSections({
  req,
  collapseKey,
  empty,
  groups,
  update
}: GroupedListProps &
  Readonly<{
    groups: ReadonlyArray<Group>
    update: OrgTicketUpdate
  }>) {
  const preview = useTicketPreview()
  if (groups.every((group) => group.tickets.length === 0)) return empty
  return (
    <>
      <div className="flex flex-col gap-1">
        {groups.map((group) => (
          <GroupSection
            key={group.id}
            req={req}
            collapseKey={collapseKey}
            group={group}
            update={update}
            preview={preview}
          />
        ))}
      </div>
    </>
  )
}

function GroupSection({
  req,
  collapseKey,
  group,
  update,
  preview
}: Readonly<{
  req: OrgTicketsRequest
  collapseKey: string
  group: Group
  update: OrgTicketUpdate
  preview: TicketPreview
}>) {
  const [collapsed, toggle] = useCollapsedInSet(
    collapseKey,
    group.id,
    undefined
  )
  const [expanded, setExpanded] = useState(false)
  const limited = group.expandable !== undefined && !expanded
  const shown = limited
    ? group.tickets.slice(0, COMPACT_TICKET_LIMIT)
    : group.tickets
  return (
    <div className="flex flex-col">
      <SectionHeader
        variant="sticky"
        heading={group.heading}
        count={group.count}
        collapsed={collapsed}
        creating={false}
        canCreate={false}
        onToggleCollapsed={toggle}
        onStartCreate={noop}
        onDismissCreate={noop}
        creator={null}
      />
      <SectionBody collapsed={collapsed}>
        {group.tickets.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            —
          </div>
        ) : (
          <DashboardRows
            req={req}
            tickets={shown}
            update={update}
            preview={preview}
          />
        )}
        {group.footer}
        {limited && group.count > shown.length && (
          <RevealMoreButton
            remaining={group.count - shown.length}
            onReveal={() => setExpanded(true)}
          />
        )}
        {group.expandable !== undefined &&
          expanded &&
          group.tickets.length < group.count &&
          group.expandable.pagination}
      </SectionBody>
    </div>
  )
}

const noop = () => {}
