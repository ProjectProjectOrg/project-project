import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ArchiveTicketInput, TicketId } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Split,
  Trash2
} from "lucide-react"
import { useMemo, useRef, useState } from "react"

import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm"
import { ArchiveForm } from "@/components/TicketList/ArchiveControl"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent } from "@/components/ui/popover"
import {
  archiveTicket,
  deleteTicket,
  ticketRequest,
  unarchiveTicket
} from "@/features/tickets/atoms/ticketDetail"
import { useProjectActor } from "@/lib/access"
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
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [reason, setReason] = useState("")
  const trigger = useRef<HTMLButtonElement>(null)
  const req = useMemo(
    () => ticketRequest(orgSlug, slug, id),
    [orgSlug, slug, id]
  )
  const archive = useAtomSet(archiveTicket(req), { mode: "promiseExit" })
  const archiveState = useAtomValue(archiveTicket(req))
  const unarchive = useAtomSet(unarchiveTicket(req))
  const unarchiveState = useAtomValue(unarchiveTicket(req))
  const remove = useAtomSet(deleteTicket(req), { mode: "promiseExit" })
  const removeState = useAtomValue(deleteTicket(req))
  const actor = useProjectActor()
  const canArchive = actor.call("tickets", "archive")
  const canDelete = actor.call("tickets", "delete")

  if (!canArchive && !canDelete) return null

  const archiveAndClose = async (input: ArchiveTicketInput) => {
    const exit = await archive(input)
    if (Exit.isSuccess(exit)) setArchiving(false)
    return exit
  }

  const removeAndClose = async () => {
    const exit = await remove()
    if (Exit.isSuccess(exit)) setConfirmingDelete(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              ref={trigger}
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
          className="w-48"
          onClick={(e) => e.stopPropagation()}
        >
          {canArchive && (
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
                  onClick={() => setArchiving(true)}
                  className="cursor-pointer"
                >
                  <Archive className="size-4" strokeWidth={1.75} />
                  {m.tickets_archive_submit()}
                </DropdownMenuItem>
              )}
            </>
          )}
          {canArchive && canDelete && <DropdownMenuSeparator />}
          {canDelete && (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmingDelete(true)}
              className="cursor-pointer"
            >
              <Trash2 className="size-4" strokeWidth={1.75} />
              {m.tickets_row_delete_menu_item()}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover
        open={archiving}
        onOpenChange={setArchiving}
        onOpenChangeComplete={(next) => {
          if (!next) setReason("")
        }}
      >
        <PopoverContent
          anchor={trigger}
          align="end"
          sideOffset={6}
          className="w-72"
          onClick={(e) => e.stopPropagation()}
        >
          <ArchiveForm
            reason={reason}
            onReasonChange={setReason}
            onArchive={archiveAndClose}
            waiting={archiveState.waiting}
            failed={Result.isFailure(archiveState)}
            onClose={() => setArchiving(false)}
          />
        </PopoverContent>
      </Popover>
      <Popover open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <PopoverContent
          anchor={trigger}
          align="end"
          sideOffset={6}
          className="w-72"
          onClick={(e) => e.stopPropagation()}
        >
          <ConfirmDeleteForm
            title={m.tickets_row_delete_confirm()}
            description={m.tickets_row_delete_description()}
            error={
              Result.isFailure(removeState)
                ? m.tickets_row_delete_error_fallback()
                : undefined
            }
            waiting={removeState.waiting}
            onConfirm={() => void removeAndClose()}
            onCancel={() => setConfirmingDelete(false)}
          />
        </PopoverContent>
      </Popover>
    </>
  )
}
