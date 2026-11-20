import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ProjectStatus } from "@pp/shared"
import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuConfirmItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { MoreHorizontal, Pencil, Trash2 } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import * as Result from "effect/reactivity/AsyncResult"

import {
  gitAutomationFor,
  gitAutomationRequest
} from "@/features/projects/atoms/gitAutomation"
import {
  deleteStatus,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  countsRequest,
  ticketCounts
} from "@/features/tickets/atoms/ticketCounts"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import { useProjectActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

type Props = Readonly<{
  status: ProjectStatus
  statuses: ReadonlyArray<ProjectStatus>
}>

export function StatusActionsMenu({
  status,
  statuses,
  label,
  canDelete,
  onEdit
}: Props &
  Readonly<{
    label: string
    canDelete: boolean
    onEdit: () => void
  }>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.tickets_status_actions_aria({ label })}
            className="shrink-0"
          >
            <MoreHorizontal strokeWidth={1.75} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-44">
        <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
          <Pencil className="size-4" strokeWidth={1.75} />
          {m.tickets_status_edit()}
        </DropdownMenuItem>
        {canDelete ? (
          <>
            <DropdownMenuSeparator />
            <DeleteStatusItems status={status} statuses={statuses} />
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Delete, confirmed in place. A status with tickets opens a submenu of
// where to move them; each target is a confirm item ("Move to Done and
// delete?"). A status git automation moves tickets into says so at the top
// of the submenu, since deleting it resets those rules.
function DeleteStatusItems({ status, statuses }: Props) {
  const { orgSlug, slug } = useProjectRoute()
  const remove = useAtomSet(
    deleteStatus({
      req: statusesRequest(orgSlug, slug),
      statusSlug: status.slug
    }),
    { mode: "promiseExit" }
  )
  const counts = useAtomValue(ticketCounts(countsRequest(orgSlug, slug, {})))
  const affected = Result.isSuccess(counts)
    ? (counts.value.byStatus[status.slug] ?? 0)
    : 0
  const automation = useAutomationReset(status)
  const icon = <Trash2 className="size-4" strokeWidth={1.75} />
  const describeError = () => m.tickets_status_delete_error_fallback()

  if (affected === 0 && !automation.resets)
    return (
      <DropdownMenuConfirmItem
        icon={icon}
        label={m.tickets_status_delete_button()}
        confirmLabel={m.tickets_status_delete_confirm_empty()}
        disabled={!automation.ready}
        busyLabel={m.common_deleting_button()}
        describeError={describeError}
        onConfirm={() => remove({ reassignTo: undefined })}
      />
    )

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        disabled={!automation.ready}
        variant="destructive"
      >
        {icon}
        {m.tickets_status_delete_button()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64">
        {automation.resets ? (
          <p className="px-2 py-1.5 text-caption text-muted-foreground">
            {m.tickets_status_delete_resets_git_automation()}
          </p>
        ) : null}
        {affected === 0 ? (
          <DropdownMenuConfirmItem
            icon={icon}
            label={m.tickets_status_delete_button()}
            confirmLabel={m.tickets_status_delete_confirm_empty()}
            busyLabel={m.common_deleting_button()}
            describeError={describeError}
            onConfirm={() => remove({ reassignTo: undefined })}
          />
        ) : (
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {m.tickets_status_delete_confirm_with_tickets({
                count: affected
              })}
            </DropdownMenuLabel>
            {statuses
              .filter((target) => target.slug !== status.slug)
              .map((target) => {
                const meta = statusMetaFor(target.slug, statuses)
                const Icon = meta.icon
                return (
                  <DropdownMenuConfirmItem
                    key={target.slug}
                    quiet
                    icon={
                      <Icon
                        className={cn("size-4", meta.className)}
                        style={meta.color ? { color: meta.color } : undefined}
                        strokeWidth={1.75}
                      />
                    }
                    label={meta.label}
                    confirmLabel={m.tickets_status_delete_move_confirm({
                      status: meta.label
                    })}
                    busyLabel={m.common_deleting_button()}
                    describeError={describeError}
                    onConfirm={() => remove({ reassignTo: target.slug })}
                  />
                )
              })}
          </DropdownMenuGroup>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

// Whether git automation can be read yet, and whether deleting this status
// resets any of its rules. Without permission to read it, there is nothing
// to wait for and nothing to warn about.
function useAutomationReset(status: ProjectStatus) {
  const canRead = useProjectActor().call("gitAutomation", "get")
  const { orgSlug, slug } = useProjectRoute()
  const automation = useAtomValue(
    gitAutomationFor(gitAutomationRequest(orgSlug, slug))
  )
  if (!canRead) return { ready: true, resets: false }
  if (!Result.isSuccess(automation)) return { ready: false, resets: false }
  return {
    ready: true,
    resets: Object.values(automation.value.rules).includes(status.slug)
  }
}
