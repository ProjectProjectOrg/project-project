import { useAtomValue } from "@effect/atom-react"
import type { ProjectStatus } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"

import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import { cn } from "@/lib/utils"

const NO_STATUSES: ReadonlyArray<ProjectStatus> = []

export function TicketStatusIcon({
  status,
  orgSlug,
  slug,
  className
}: Readonly<{
  status: string
  orgSlug: string
  slug: string
  className?: string
}>) {
  const result = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  const meta = statusMetaFor(
    status,
    Result.isSuccess(result) ? result.value : NO_STATUSES
  )
  const Icon = meta.icon
  return (
    <Icon
      role="img"
      aria-label={meta.label}
      className={cn("size-3.5 shrink-0", meta.className, className)}
      style={meta.color ? { color: meta.color } : undefined}
      strokeWidth={1.75}
    />
  )
}
