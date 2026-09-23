import { useAtomValue } from "@effect/atom-react"
import type {
  ProjectStatus,
  Ticket,
  TicketStatus,
  UpdateTicketInput
} from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { ArrowRight, Check } from "lucide-react"
import { useMemo } from "react"

import { boardStatusesFor } from "@/components/sprints/board-utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Hitbox } from "@/components/ui/hitbox"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { statusMetaFor, statusLabelFor } from "@/lib/ticket-meta"
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
  current: string
  statuses: ReadonlyArray<ProjectStatus>
  onSelect: (next: TicketStatus) => void
}) {
  const slugs = boardStatusesFor(statuses)
  return (
    <>
      {slugs.map((status) => {
        const sMeta = statusMetaFor(status, statuses)
        const SIcon = sMeta.icon
        return (
          <DropdownMenuItem
            key={status}
            onClick={() => {
              if (status === current) return
              onSelect(status as TicketStatus)
            }}
            className="cursor-pointer"
          >
            <SIcon
              className={cn("size-4", sMeta.className)}
              style={sMeta.color ? { color: sMeta.color } : undefined}
              strokeWidth={1.75}
            />
            {sMeta.label}
            {status === current && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        )
      })}
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

export function StatusBadgeTrigger({
  orgSlug,
  slug,
  ticket,
  onPatch,
  className
}: {
  orgSlug: string
  slug: string
  ticket: Ticket
  onPatch: (patch: UpdateTicketInput) => void
  className?: string
}) {
  const req = useMemo(() => statusesRequest(orgSlug, slug), [orgSlug, slug])
  const statusesResult = useAtomValue(statusesFor(req))
  const statuses = Result.isSuccess(statusesResult) ? statusesResult.value : []
  const meta = statusMetaFor(ticket.status, statuses)
  const Icon = meta.icon
  const statusLabel = statusLabelFor(ticket.status, statuses)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="chip"
            onClick={(e) => e.stopPropagation()}
            aria-label={m.tickets_status_aria_label({ label: statusLabel })}
            className={className}
          >
            <Icon
              className={cn("size-3.5", meta.className)}
              style={meta.color ? { color: meta.color } : undefined}
              strokeWidth={1.75}
            />
            <span>{statusLabel}</span>
          </Button>
        }
      />
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-44"
        finalFocus={false}
        onClick={(e) => e.stopPropagation()}
      >
        <StatusMenuItems
          orgSlug={orgSlug}
          slug={slug}
          current={ticket.status}
          statuses={statuses}
          onSelect={(status) => {
            if (status === ticket.status) return
            onPatch({ status })
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
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
  const Icon = meta.icon
  const statusLabel = statusLabelFor(value, statuses)
  const wrapperClass =
    size === "lg"
      ? "grid size-10 place-items-center rounded-lg bg-muted transition-colors group-hover/hitbox:bg-foreground/5"
      : cn(
          "grid size-6 place-items-center rounded-full transition-colors group-hover/hitbox:bg-foreground/5",
          meta.className
        )
  const iconClass = size === "lg" ? cn("size-5", meta.className) : "size-4"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Hitbox
            mode="inline"
            margin={size === "lg" ? "1" : "2"}
            onClick={(e) => stopPropagation && e.stopPropagation()}
            aria-label={
              disabled
                ? statusLabel
                : m.tickets_status_aria_label({ label: statusLabel })
            }
            title={statusLabel}
            disabled={disabled}
          >
            <span className={wrapperClass}>
              <Icon
                className={iconClass}
                style={meta.color ? { color: meta.color } : undefined}
                strokeWidth={1.75}
              />
            </span>
          </Hitbox>
        }
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
  const req = useMemo(() => statusesRequest(orgSlug, slug), [orgSlug, slug])
  const statusesResult = useAtomValue(statusesFor(req))
  const statuses = Result.isSuccess(statusesResult) ? statusesResult.value : []
  const meta = statusMetaFor(ticket.status, statuses)
  const Icon = meta.icon
  const statusLabel = statusLabelFor(ticket.status, statuses)
  const wrapperClass =
    size === "lg"
      ? "grid size-10 place-items-center rounded-lg bg-muted transition-colors group-hover/hitbox:bg-foreground/5"
      : cn(
          "grid size-6 place-items-center rounded-full transition-colors group-hover/hitbox:bg-foreground/5",
          meta.className
        )
  const iconClass = size === "lg" ? cn("size-5", meta.className) : "size-4"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Hitbox
            mode="inline"
            margin={size === "lg" ? "1" : "2"}
            onClick={(e) => stopPropagation && e.stopPropagation()}
            aria-label={
              disabled
                ? statusLabel
                : m.tickets_status_aria_label({ label: statusLabel })
            }
            title={statusLabel}
            disabled={disabled}
          >
            <span className={wrapperClass}>
              <Icon
                className={iconClass}
                style={meta.color ? { color: meta.color } : undefined}
                strokeWidth={1.75}
              />
            </span>
          </Hitbox>
        }
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
          current={ticket.status}
          statuses={statuses}
          onSelect={(status) => {
            if (status === ticket.status) return
            onPatch({ status })
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
