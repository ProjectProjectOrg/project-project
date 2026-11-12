import { useAtomValue } from "@effect/atom-react"
import type { Ticket, TicketStatus } from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { ArrowRight } from "lucide-react"
import { type MouseEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Hitbox } from "@/components/ui/hitbox"
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
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

function StatusTrigger({
  meta,
  label,
  size,
  disabled,
  stopPropagation,
  showLabel
}: Readonly<{
  meta: ReturnType<typeof statusMetaFor>
  label: string
  size: "sm" | "lg"
  disabled: boolean
  stopPropagation?: boolean
  showLabel?: boolean
}>) {
  const Icon = meta.icon
  const icon = (
    <Icon
      className={
        size === "lg"
          ? cn("size-5", meta.className)
          : showLabel
            ? cn("size-3.5", meta.className)
            : meta.className
      }
      style={meta.color ? { color: meta.color } : undefined}
      strokeWidth={1.75}
    />
  )
  const triggerProps = {
    onClick: (e: MouseEvent) => {
      if (stopPropagation) e.stopPropagation()
    },
    "aria-label": disabled ? label : m.tickets_status_aria_label({ label }),
    title: label,
    disabled
  }
  if (size === "lg") {
    return (
      <DropdownMenuTrigger
        render={<Hitbox mode="inline" margin="1" {...triggerProps} />}
      >
        <span className="grid size-10 place-items-center rounded-lg bg-muted transition-colors hitbox-hover:bg-foreground/5">
          {icon}
        </span>
      </DropdownMenuTrigger>
    )
  }
  return (
    <DropdownMenuTrigger
      render={
        <Button
          type="button"
          variant="chip"
          size={showLabel ? undefined : "square-6"}
          {...triggerProps}
        />
      }
    >
      {icon}
      {showLabel && <span>{label}</span>}
    </DropdownMenuTrigger>
  )
}

export function StatusSelect({
  value,
  selected = value,
  onChange,
  size = "sm",
  stopPropagation,
  disabled = false,
  showLabel = false,
  manageAction = true
}: {
  value: TicketStatus
  selected?: TicketStatus | null
  onChange: (status: TicketStatus) => void
  size?: "sm" | "lg"
  stopPropagation?: boolean
  disabled?: boolean
  showLabel?: boolean
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
        size={size}
        disabled={disabled}
        stopPropagation={stopPropagation}
        showLabel={showLabel}
      />
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-44"
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
                  to: "/orgs/$orgSlug/projects/$slug/settings/workflow",
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
  size = "sm",
  onPatch,
  disabled = false
}: {
  ticket: Ticket
  selected?: TicketStatus | null
  stopPropagation?: boolean
  size?: "sm" | "lg"
  onPatch: (patch: TicketEdit) => void
  disabled?: boolean
}) {
  return (
    <StatusSelect
      value={ticket.status}
      selected={selected === undefined ? ticket.status : selected}
      size={size}
      disabled={disabled}
      stopPropagation={stopPropagation}
      onChange={(status) => onPatch({ status })}
    />
  )
}
