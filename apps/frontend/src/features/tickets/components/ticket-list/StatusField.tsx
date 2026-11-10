import { useAtomValue } from "@effect/atom-react"
import type { Ticket, TicketStatus, UpdateTicketInput } from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { ArrowRight } from "lucide-react"
import { type MouseEvent } from "react"

import { Button } from "@/components/ui/button"
import { Hitbox } from "@/components/ui/hitbox"
import { Select, SelectTrigger } from "@/components/ui/select"
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
      <SelectTrigger
        render={<Hitbox mode="inline" margin="1" {...triggerProps} />}
      >
        <span className="grid size-10 place-items-center rounded-lg bg-muted transition-colors hitbox-hover:bg-foreground/5">
          {icon}
        </span>
      </SelectTrigger>
    )
  }
  return (
    <SelectTrigger
      render={
        <Button
          type="button"
          variant="chip"
          size={showLabel ? undefined : "icon-sm"}
          {...triggerProps}
        />
      }
    >
      {icon}
      {showLabel && <span>{label}</span>}
    </SelectTrigger>
  )
}

const MANAGE_STATUSES = "__manage-statuses"

export function StatusSelect({
  value,
  onChange,
  size = "sm",
  stopPropagation,
  disabled = false,
  showLabel = false,
  manageAction = true
}: {
  value: TicketStatus
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
  const statusOptions = boardStatusesFor(statuses).map((status, index, all) => {
    const sMeta = statusMetaFor(status, statuses)
    const SIcon = sMeta.icon
    return {
      value: status,
      textValue: sMeta.label,
      separated: manageAction && index === all.length - 1,
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
  const manageOptions = manageAction
    ? [
        {
          value: MANAGE_STATUSES,
          textValue: m.tickets_status_manage_link(),
          label: (
            <>
              {m.tickets_status_manage_link()}
              <ArrowRight className="ml-auto size-3.5" />
            </>
          ),
          onAction: () =>
            void navigate({
              to: "/orgs/$orgSlug/projects/$slug/settings/workflow",
              params: { orgSlug, slug }
            })
        }
      ]
    : []
  const items = [...statusOptions, ...manageOptions]
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== value) onChange(next)
      }}
      items={items}
      contentProps={{ className: "w-44" }}
    >
      <StatusTrigger
        meta={meta}
        label={statusLabel}
        size={size}
        disabled={disabled}
        stopPropagation={stopPropagation}
        showLabel={showLabel}
      />
    </Select>
  )
}

export function StatusButton({
  ticket,
  stopPropagation,
  size = "sm",
  onPatch,
  disabled = false
}: {
  ticket: Ticket
  stopPropagation?: boolean
  size?: "sm" | "lg"
  onPatch: (patch: UpdateTicketInput) => void
  disabled?: boolean
}) {
  return (
    <StatusSelect
      value={ticket.status}
      size={size}
      disabled={disabled}
      stopPropagation={stopPropagation}
      onChange={(status) => {
        if (status !== ticket.status) onPatch({ status })
      }}
    />
  )
}
