import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import type { ReactNode } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import { ProjectTile } from "@/components/ProjectTile"
import { SectionBody } from "@/components/TicketList/SectionBody"
import { useCollapsedInSet } from "@/components/TicketList/sectionCollapse"
import {
  SectionHeader,
  type SectionHeading
} from "@/components/TicketList/SectionHeader"
import { useTicketPreview } from "@/components/TicketList/useTicketPreview"
import {
  myTicketBoard,
  myTicketsByProject,
  updateMyTicket,
  type OrgTicket,
  type OrgTicketsRequest
} from "@/features/tickets/atoms/myTickets"
import { getStatusIcon } from "@/lib/status-icons"

import { DashboardRows, type TicketPreview } from "./DashboardTicket"

export type DashboardGrouping = "project" | "status" | "none"

type GroupedListProps = Readonly<{
  req: OrgTicketsRequest
  collapseKey: string
  loading: ReactNode
  empty: ReactNode
  footer: (hasMore: boolean) => ReactNode
}>

type Group = Readonly<{
  id: string
  heading: SectionHeading
  tickets: ReadonlyArray<OrgTicket>
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
        hasMore={value.hasMore}
        groups={value.groups.map(({ project, tickets }) => ({
          id: project.slug,
          heading: {
            label: project.name,
            icon: (
              <ProjectTile
                orgSlug={req.params.orgSlug}
                icon={project.icon}
                iconImage={project.iconImage}
                color={project.color}
                size="xs"
                seed={project.slug}
              />
            )
          },
          tickets
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
        hasMore={value.hasMore}
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
            tickets: column.items
          }
        })}
      />
    )
  })
}

function GroupedSections({
  req,
  collapseKey,
  empty,
  footer,
  groups,
  hasMore
}: GroupedListProps &
  Readonly<{ groups: ReadonlyArray<Group>; hasMore: boolean }>) {
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
            preview={preview}
          />
        ))}
      </div>
      {footer(hasMore)}
    </>
  )
}

function GroupSection({
  req,
  collapseKey,
  group,
  preview
}: Readonly<{
  req: OrgTicketsRequest
  collapseKey: string
  group: Group
  preview: TicketPreview
}>) {
  const [collapsed, toggle] = useCollapsedInSet(
    collapseKey,
    group.id,
    undefined
  )
  return (
    <div className="flex flex-col">
      <SectionHeader
        variant="sticky"
        heading={group.heading}
        count={group.tickets.length}
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
            tickets={group.tickets}
            update={updateMyTicket}
            preview={preview}
          />
        )}
      </SectionBody>
    </div>
  )
}

const noop = () => {}
