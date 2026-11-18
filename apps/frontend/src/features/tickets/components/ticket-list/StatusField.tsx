import { useAtomValue } from "@effect/atom-react"
import type { Ticket, TicketStatus } from "@pp/shared"
import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { ArrowRight } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { ShortcutTooltip } from "@pp/ui/tooltip"
import { useNavigate } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { type MouseEvent } from "react"

import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { boardStatusesFor } from "@/features/sprints/lib/boardUtils"
import {
  statusMetaFor,
  statusLabelFor
} from "@/features/tickets/lib/ticketMeta"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { appHotkeys } from "@/lib/appHotkeys"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

function StatusTrigger({
  meta,
  label,
  disabled,
  stopPropagation,
  showLabel,
  blocked
}: Readonly<{
  meta: ReturnType<typeof statusMetaFor>
  label: string
  disabled: boolean
  stopPropagation?: boolean
  showLabel?: boolean
  blocked: boolean
}>) {
  const Icon = meta.icon
  const icon = (
    <Icon
      className={showLabel ? cn("size-3.5", meta.className) : meta.className}
      style={meta.color ? { color: meta.color } : undefined}
      strokeWidth={1.75}
    />
  )
  const triggerProps = {
    onClick: (e: MouseEvent) => {
      if (stopPropagation) e.stopPropagation()
    },
    "aria-label": disabled ? label : m.tickets_status_aria_label({ label }),
    disabled
  }
  return (
    <ShortcutTooltip
      hotkey={appHotkeys["tickets.status"]}
      label={label}
      keyLabels={keyLabels()}
    >
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            tone="strong"
            size={showLabel ? undefined : "square-6"}
            {...triggerProps}
          />
        }
      >
        {blocked ? (
          <span className="relative inline-flex">
            {icon}
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-state-warning ring-2 ring-page"
            />
          </span>
        ) : (
          icon
        )}
        {showLabel && <span>{label}</span>}
      </DropdownMenuTrigger>
    </ShortcutTooltip>
  )
}

export function StatusSelect({
  value,
  selected = value,
  onChange,
  stopPropagation,
  disabled = false,
  showLabel = false,
  blocked = false,
  manageAction = true
}: {
  value: TicketStatus
  selected?: TicketStatus | null
  onChange: (status: TicketStatus) => void
  stopPropagation?: boolean
  disabled?: boolean
  showLabel?: boolean
  blocked?: boolean
  manageAction?: boolean
}) {
  const { orgSlug, slug } = useProjectRoute()
  const req = statusesRequest(orgSlug, slug)
  const statusesResult = useAtomValue(statusesFor(req))
  const statuses = Result.isSuccess(statusesResult) ? statusesResult.value : []
  const meta = statusMetaFor(value, statuses)
  const statusLabel = statusLabelFor(value, statuses)
  const navigate = useNavigate()
  const statusOptions = boardStatusesFor(statuses).map((status) => {
    const sMeta = statusMetaFor(status, statuses)
    const SIcon = sMeta.icon
    return {
      value: status,
      textValue: sMeta.label,
      closeOnClick: true,
      label: (
        <>
          <SIcon
            className={cn("size-4", sMeta.className)}
            style={sMeta.color ? { color: sMeta.color } : undefined}
            strokeWidth={1.75}
          />
          {sMeta.label}
        </>
      )
    }
  })
  return (
    <DropdownMenu disabled={disabled}>
      <StatusTrigger
        meta={meta}
        label={statusLabel}
        disabled={disabled}
        stopPropagation={stopPropagation}
        showLabel={showLabel}
        blocked={blocked}
      />
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="max-w-72 min-w-44"
        finalFocus={false}
      >
        <DropdownMenuRadioGroup
          value={selected}
          onValueChange={(next) => {
            if (next !== selected) onChange(next)
          }}
          items={statusOptions}
        />
        {manageAction && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                void navigate({
                  to: "/settings/orgs/$orgSlug/projects/$slug/workflow",
                  params: { orgSlug, slug }
                })
              }
              className="cursor-pointer"
            >
              {m.tickets_status_manage_link()}
              <ArrowRight className="ml-auto size-3.5" />
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function StatusButton({
  ticket,
  selected,
  stopPropagation,
  onPatch,
  disabled = false
}: {
  ticket: Ticket
  selected?: TicketStatus | null
  stopPropagation?: boolean
  onPatch: (patch: TicketEdit) => void
  disabled?: boolean
}) {
  return (
    <StatusSelect
      value={ticket.status}
      selected={selected === undefined ? ticket.status : selected}
      disabled={disabled}
      stopPropagation={stopPropagation}
      onChange={(status) => onPatch({ status })}
    />
  )
}
