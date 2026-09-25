import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { Archive, ArchiveRestore, MoreHorizontal, Split } from "lucide-react"
import { useMemo, useState } from "react"

import { ArchiveForm } from "@/components/TicketList/ArchiveControl"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  archiveTicket,
  ticketRequest,
  unarchiveTicket
} from "@/features/tickets/atoms/ticketDetail"
import { useProjectCan } from "@/lib/access"
import { m } from "@/paraglide/messages"

export function TicketRowActions({
  orgSlug,
  slug,
  id,
  archived
}: {
  orgSlug: string
  slug: string
  id: TicketId
  archived: boolean
}) {
  const [archiving, setArchiving] = useState(false)
  const [reason, setReason] = useState("")
  const req = useMemo(
    () => ticketRequest(orgSlug, slug, id),
    [orgSlug, slug, id]
  )
  const archive = useAtomSet(archiveTicket(req), { mode: "promiseExit" })
  const archiveState = useAtomValue(archiveTicket(req))
  const unarchive = useAtomSet(unarchiveTicket(req))
  const unarchiveState = useAtomValue(unarchiveTicket(req))
  const canArchive = useProjectCan()("tickets", "archive")

  if (!canArchive) return null

  return (
    <DropdownMenu
      onOpenChange={(next) => {
        if (!next) {
          setArchiving(false)
          setReason("")
        }
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.tickets_row_actions_aria_label()}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
          >
            <MoreHorizontal strokeWidth={1.75} />
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className={archiving ? "w-72" : "w-48"}
        onClick={(e) => e.stopPropagation()}
      >
        {archiving ? (
          <div className="p-1">
            <ArchiveForm
              reason={reason}
              onReasonChange={setReason}
              onArchive={archive}
              waiting={archiveState.waiting}
              failed={Result.isFailure(archiveState)}
              onClose={() => setArchiving(false)}
            />
          </div>
        ) : (
          <>
            <DropdownMenuItem
              render={
                <Link
                  to="/orgs/$orgSlug/projects/$slug/tickets/$id/split"
                  params={{ orgSlug, slug, id }}
                  className="cursor-pointer"
                />
              }
            >
              <Split className="size-4" strokeWidth={1.75} />
              {m.tickets_split_menu_item()}
            </DropdownMenuItem>
            {archived ? (
              <DropdownMenuItem
                disabled={unarchiveState.waiting}
                onClick={() => unarchive()}
                className="cursor-pointer"
              >
                <ArchiveRestore className="size-4" strokeWidth={1.75} />
                {Result.isFailure(unarchiveState)
                  ? m.tickets_unarchive_error_fallback()
                  : m.tickets_unarchive_button()}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                closeOnClick={false}
                onClick={() => setArchiving(true)}
                className="cursor-pointer"
              >
                <Archive className="size-4" strokeWidth={1.75} />
                {m.tickets_archive_submit()}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
