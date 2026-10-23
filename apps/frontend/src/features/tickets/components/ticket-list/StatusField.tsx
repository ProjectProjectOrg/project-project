import { useAtomValue } from "@effect/atom-react"
import type {
  ProjectStatus,
  Ticket,
  TicketStatus,
  UpdateTicketInput
} from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { ArrowRight } from "lucide-react"
import { type MouseEvent, useMemo } from "react"

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
import { boardStatusesFor } from "@/features/sprints/lib/boardUtils"
import {
  statusMetaFor,
  statusLabelFor
} from "@/features/tickets/lib/ticketMeta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

function StatusMenuItems({
  orgSlug,
  slug,
  current,
  statuses,
  onSelect
}: {
  orgSlug: string
  slug: string
  current: TicketStatus
  statuses: ReadonlyArray<ProjectStatus>
  onSelect: (next: TicketStatus) => void
}) {
  const slugs = boardStatusesFor(statuses)
  return (
    <>
      <DropdownMenuRadioGroup
        value={current}
        onValueChange={(next) => {
          if (next !== current) onSelect(next)
        }}
        items={slugs.map((status) => {
          const sMeta = statusMetaFor(status, statuses)
          const SIcon = sMeta.icon
          return {
            value: status,
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
        })}
      />
      <DropdownMenuSeparator />
      <DropdownMenuItem
        render={
          <Link
            to="/orgs/$orgSlug/projects/$slug/settings/workflow"
            params={{ orgSlug, slug }}
            className="cursor-pointer"
          />
        }
      >
        {m.tickets_status_manage_link()}
        <ArrowRight className="ml-auto size-3.5" />
      </DropdownMenuItem>
    </>
  )
}

function StatusTrigger({
  meta,
  label,
  size,
  disabled,
  stopPropagation
}: Readonly<{
  meta: ReturnType<typeof statusMetaFor>
  label: string
  size: "sm" | "lg"
  disabled: boolean
  stopPropagation?: boolean
}>) {
  const Icon = meta.icon
  const icon = (
    <Icon
      className={size === "lg" ? cn("size-5", meta.className) : meta.className}
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
  return (
    <DropdownMenuTrigger
      render={
        size === "lg" ? (
          <Hitbox mode="inline" margin="1" {...triggerProps}>
            <span className="grid size-10 place-items-center rounded-lg bg-muted transition-colors group-hover/hitbox:bg-foreground/5">
              {icon}
            </span>
          </Hitbox>
        ) : (
          <Button type="button" variant="chip" size="icon-sm" {...triggerProps}>
            {icon}
          </Button>
        )
      }
    />
  )
}

export function StatusSelect({
  orgSlug,
  slug,
  value,
  onChange,
  size = "sm",
  stopPropagation,
  disabled = false
}: {
  orgSlug: string
  slug: string
  value: TicketStatus
  onChange: (status: TicketStatus) => void
  size?: "sm" | "lg"
  stopPropagation?: boolean
  disabled?: boolean
}) {
  const req = useMemo(() => statusesRequest(orgSlug, slug), [orgSlug, slug])
  const statusesResult = useAtomValue(statusesFor(req))
  const statuses = Result.isSuccess(statusesResult) ? statusesResult.value : []
  const meta = statusMetaFor(value, statuses)
  const statusLabel = statusLabelFor(value, statuses)
  return (
    <DropdownMenu>
      <StatusTrigger
        meta={meta}
        label={statusLabel}
        size={size}
        disabled={disabled}
        stopPropagation={stopPropagation}
      />
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-44"
        onClick={(e) => e.stopPropagation()}
      >
        <StatusMenuItems
          orgSlug={orgSlug}
          slug={slug}
          current={value}
          statuses={statuses}
          onSelect={onChange}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function StatusButton({
  orgSlug,
  slug,
  ticket,
  stopPropagation,
  size = "sm",
  onPatch,
  disabled = false
}: {
  orgSlug: string
  slug: string
  ticket: Ticket
  stopPropagation?: boolean
  size?: "sm" | "lg"
  onPatch: (patch: UpdateTicketInput) => void
  disabled?: boolean
}) {
  return (
    <StatusSelect
      orgSlug={orgSlug}
      slug={slug}
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
