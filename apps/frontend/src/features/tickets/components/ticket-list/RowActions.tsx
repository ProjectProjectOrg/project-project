import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { TicketPolicy } from "@pp/access/policies"
import type { ArchiveTicketInput, TicketId } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Split,
  Trash2,
  Unlink
} from "lucide-react"
import { useId, useRef, useState, type RefObject } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  archiveTicket,
  deleteTicket,
  ticketRequest,
  unarchiveTicket
} from "@/features/tickets/atoms/ticketDetail"
import { ArchiveForm } from "@/features/tickets/components/ticket-list/ArchiveControl"
import { MarkAsSubmenu } from "@/features/tickets/components/ticket-marks/MarkAsSubmenu"
import {
  SaveAsTemplateMenuItem,
  SaveAsTemplatePopover
} from "@/features/tickets/components/ticket-page/SaveAsTemplatePopover"
import type { SaveAsTemplateProps } from "@/features/tickets/forms/save-as-template"
import { useProjectActor } from "@/hooks/useActor"
import { useContextMenu, type ContextRegion } from "@/hooks/useContextMenu"
import { m } from "@/paraglide/messages"

export function TicketRowActions({
  id,
  archived,
  parent,
  onDetach,
  onDeleted,
  subTickets = 0,
  epic = false,
  template,
  contextTarget,
  contextRegion
}: {
  id: TicketId
  archived: boolean
  parent: TicketId | null
  onDetach?: () => void
  onDeleted?: () => void
  subTickets?: number
  epic?: boolean
  template?: SaveAsTemplateProps
  contextTarget?: RefObject<HTMLElement | null>
  contextRegion?: ContextRegion
}) {
  const { orgSlug, slug } = useProjectRoute()
  const [archiving, setArchiving] = useState(false)
  const [reason, setReason] = useState("")
  const trigger = useRef<HTMLButtonElement>(null)
  const req = ticketRequest(orgSlug, slug, id)
  const archive = useAtomSet(archiveTicket(req), { mode: "promiseExit" })
  const archiveState = useAtomValue(archiveTicket(req))
  const unarchive = useAtomSet(unarchiveTicket(req))
  const unarchiveState = useAtomValue(unarchiveTicket(req))
  const remove = useAtomSet(deleteTicket(req), { mode: "promiseExit" })
  const removeState = useAtomValue(deleteTicket(req))
  const actor = useProjectActor()
  const canArchive = actor.call("tickets", "archive")
  const canDelete = actor.call("tickets", "delete")
  const canMark = !archived && TicketPolicy.canChange(actor, { content: true })
  const detachFrom =
    onDetach !== undefined && TicketPolicy.canChange(actor, { content: true })
      ? parent
      : null
  const noTarget = useRef<HTMLElement>(null)
  const menu = useContextMenu(
    contextTarget ?? noTarget,
    contextTarget !== undefined,
    contextRegion
  )
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [cascade, setCascade] = useState(false)
  const cascadeId = useId()
  const popupAnchor = menu.anchor ?? trigger

  if (!canArchive && !canDelete && !canMark && detachFrom === null) return null

  const archiveAndClose = async (input: ArchiveTicketInput) => {
    const exit = await archive(input)
    if (Exit.isSuccess(exit)) setArchiving(false)
    return exit
  }

  return (
    <ConfirmButton.Root bare>
      <DropdownMenu open={menu.open} onOpenChange={menu.onOpenChange}>
        <DropdownMenuTrigger
          render={
            <Button
              ref={trigger}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={m.tickets_row_actions_aria_label()}
              onPointerDown={menu.clearAnchor}
              onKeyDown={menu.clearAnchor}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
            >
              <MoreHorizontal strokeWidth={1.75} />
            </Button>
          }
        />
        <DropdownMenuContent
          anchor={menu.anchor ?? undefined}
          align={menu.anchor === null ? "end" : "start"}
          sideOffset={6}
          className="w-48"
          onClick={(e) => e.stopPropagation()}
        >
          {canMark && <MarkAsSubmenu ticketId={id} />}
          {canMark && (detachFrom !== null || canArchive || canDelete) && (
            <DropdownMenuSeparator />
          )}
          {detachFrom !== null && (
            <DropdownMenuItem onClick={onDetach} className="cursor-pointer">
              <Unlink className="size-4" strokeWidth={1.75} />
              {m.tickets_row_detach_action({ id: detachFrom })}
            </DropdownMenuItem>
          )}
          {detachFrom !== null && (canArchive || canDelete) && (
            <DropdownMenuSeparator />
          )}
          {canArchive && (
            <>
              <DropdownMenuItem
                render={
                  <Link
                    to="/orgs/$orgSlug/projects/$slug/tickets/$id/split"
                    params={{ orgSlug, slug, id }}
                    search={{ from: "list" }}
                    className="cursor-pointer"
                  />
                }
              >
                <Split className="size-4" strokeWidth={1.75} />
                {m.tickets_split_menu_item()}
              </DropdownMenuItem>
              {template !== undefined && (
                <SaveAsTemplateMenuItem
                  onSelect={() => setSavingTemplate(true)}
                />
              )}
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
            <ConfirmButton.MenuItem
              variant="destructive"
              className="cursor-pointer"
            >
              <Trash2 className="size-4" strokeWidth={1.75} />
              {m.tickets_row_delete_menu_item()}
            </ConfirmButton.MenuItem>
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
          anchor={popupAnchor}
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
      <ConfirmButton.Popover anchor={popupAnchor} className="w-72">
        <ConfirmButton.Action
          layout="stacked"
          prompt={m.tickets_row_delete_confirm()}
          description={m.tickets_row_delete_description()}
          label={m.common_delete_confirm_button()}
          waiting={removeState.waiting}
          error={
            Result.isFailure(removeState)
              ? m.tickets_row_delete_error_fallback()
              : null
          }
          onConfirm={async () => {
            const exit = await remove({ cascadeSubTickets: cascade })
            if (Exit.isSuccess(exit)) onDeleted?.()
            return exit
          }}
        >
          {subTickets > 0 && (
            <label
              htmlFor={cascadeId}
              className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
            >
              <Checkbox
                id={cascadeId}
                checked={cascade}
                onCheckedChange={setCascade}
              />
              {epic
                ? m.tickets_detail_delete_cascade_tickets({ count: subTickets })
                : m.tickets_detail_delete_cascade_sub_tickets({
                    count: subTickets
                  })}
            </label>
          )}
        </ConfirmButton.Action>
      </ConfirmButton.Popover>
      {template !== undefined && (
        <SaveAsTemplatePopover
          {...template}
          open={savingTemplate}
          onOpenChange={setSavingTemplate}
          anchor={popupAnchor}
          finalFocus={trigger}
        />
      )}
    </ConfirmButton.Root>
  )
}
