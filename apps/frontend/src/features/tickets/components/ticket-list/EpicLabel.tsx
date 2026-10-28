import { useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import {
  archivedEpicTitles,
  epicsRequest,
  openEpicTitles
} from "@/features/tickets/atoms/epics"
import { cn } from "@/lib/utils"

type EpicRef = Readonly<{ orgSlug: string; slug: string; epicId: TicketId }>

const noTitles = Atom.make(Result.initial<ReadonlyMap<TicketId, string>>())

export function useEpicTitle({ orgSlug, slug, epicId }: EpicRef) {
  const req = epicsRequest(orgSlug, slug)
  const open = useAtomValue(openEpicTitles(req))
  const archived = useAtomValue(
    Result.isSuccess(open) && !open.value.has(epicId)
      ? archivedEpicTitles(req)
      : noTitles
  )
  if (!Result.isSuccess(open)) return null
  const title = open.value.get(epicId)
  if (title !== undefined) return title
  return Result.isSuccess(archived)
    ? (archived.value.get(epicId) ?? epicId)
    : Result.isFailure(archived)
      ? epicId
      : null
}

export function EpicLink({
  className,
  ...ref
}: EpicRef & Readonly<{ className?: string }>) {
  const title = useEpicTitle(ref)
  if (title === null) return null
  return (
    <Link
      to="/orgs/$orgSlug/projects/$slug/tickets/$id"
      params={{ orgSlug: ref.orgSlug, slug: ref.slug, id: ref.epicId }}
      preload="intent"
      className={cn(
        "max-w-[24ch] shrink-0 truncate text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline",
        className
      )}
    >
      {title}
    </Link>
  )
}

export function EpicName({
  className,
  ...ref
}: EpicRef & Readonly<{ className?: string }>) {
  const title = useEpicTitle(ref)
  if (title === null) return null
  return <span className={cn("text-muted-foreground", className)}>{title}</span>
}

export function EpicSeparator({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      aria-hidden
      className={cn(
        "mx-1.5 text-muted-foreground/60 before:content-['/']",
        className
      )}
    />
  )
}

export function EpicTextPrefix(ref: EpicRef) {
  if (useEpicTitle(ref) === null) return null
  return (
    <>
      <EpicName {...ref} />
      <EpicSeparator />
    </>
  )
}
