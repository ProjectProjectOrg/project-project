import type { ProjectStatus, TicketStatus } from "@pp/shared"
import { ListSectionHeader } from "@pp/ui/list-section"
import { StatusGlyph } from "@pp/ui/status-glyph"
import type { ReactNode, RefObject } from "react"

import {
  statusLabelFor,
  statusMetaFor
} from "@/features/tickets/lib/ticketMeta"
import { m } from "@/paraglide/messages"

export type SectionHeading = {
  label: string
  icon: ReactNode
  detail?: ReactNode
}

type HeadingSource =
  | {
      heading: SectionHeading
      status?: TicketStatus
      statuses?: ReadonlyArray<ProjectStatus>
    }
  | {
      heading?: undefined
      status: TicketStatus
      statuses: ReadonlyArray<ProjectStatus>
    }

type SectionHeaderProps = HeadingSource & {
  ref?: RefObject<HTMLDivElement | null>
  count: number
  collapsed: boolean
  creating: boolean
  onToggleCollapsed: () => void
  onStartCreate: () => void
  onDismissCreate: () => void
  creator: ReactNode
  canCreate?: boolean
}

// A ticket section's header in the app: a status (with its icon) or a
// heading (sprint, epic, group), with the app's labels.
export function SectionHeader({ ref, ...props }: SectionHeaderProps) {
  const { canCreate = true, count, heading } = props
  const label = heading
    ? heading.label
    : statusLabelFor(props.status, props.statuses)
  const meta = heading ? null : statusMetaFor(props.status, props.statuses)
  return (
    <ListSectionHeader
      ref={ref}
      icon={
        meta ? (
          <StatusGlyph
            icon={meta.icon}
            className={meta.className}
            color={meta.color}
          />
        ) : (
          heading?.icon
        )
      }
      label={label}
      count={count}
      countLabel={m.tickets_section_count_aria_label({ count })}
      detail={heading?.detail}
      collapsed={props.collapsed}
      onToggleCollapsed={props.onToggleCollapsed}
      collapseLabel={m.tickets_section_collapse_aria_label({ label })}
      create={
        canCreate
          ? {
              creating: props.creating,
              creator: props.creator,
              onStart: props.onStartCreate,
              onDismiss: props.onDismissCreate,
              label: m.tickets_section_create_aria_label({ label }),
              dismissLabel: m.tickets_section_create_dismiss_aria_label({
                label
              })
            }
          : undefined
      }
    />
  )
}
