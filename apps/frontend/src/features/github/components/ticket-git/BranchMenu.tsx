import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { GithubConnection, TicketDetail } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import {
  ArrowUpRight,
  Copy,
  GitPullRequestCreateArrow,
  Layers,
  MoreHorizontal,
  Unlink,
  X
} from "lucide-react"
import { useRef, useState, type ReactElement } from "react"

import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { clearBranch } from "@/features/github/atoms/github"
import { projectRequest } from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useProjectActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

import { usePreferredBranchLink } from "./BranchChip"
import { BranchPickerSubmenu } from "./BranchPicker"

export type BranchMenuRemoval =
  | Readonly<{ kind: "ticket" }>
  | Readonly<{ kind: "stack"; busy: boolean; onRemove: () => void }>

export type BranchMenuPr = Readonly<{ href: string; label: string }>

export function BranchMenu({
  ticket,
  github,
  branch,
  openPr = null,
  removal,
  canStack = true,
  trigger
}: Readonly<{
  ticket: TicketDetail
  github: GithubConnection
  branch: string
  openPr?: BranchMenuPr | null
  removal: BranchMenuRemoval
  canStack?: boolean
  trigger?: ReactElement
}>) {
  const link = usePreferredBranchLink(
    `${github.repoOwner}/${github.repoName}`,
    branch
  )
  const actor = useProjectActor()
  const canClear = actor.call("tickets", "clearBranch")
  const canStackBranch = canStack && actor.call("tickets", "stackBranch")
  const anchor = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const removable = removal.kind === "stack" || canClear

  return (
    <ConfirmButton.Root bare>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <span ref={anchor} className="inline-flex max-w-full min-w-0">
          <DropdownMenuTrigger
            render={
              trigger ?? (
                <Button
                  variant="quiet"
                  size="square-7"
                  aria-label={m.git_stack_branch_menu_label({ branch })}
                >
                  <MoreHorizontal className="size-4" strokeWidth={1.75} />
                </Button>
              )
            }
          />
        </span>
        <DropdownMenuContent
          align={trigger === undefined ? "end" : "start"}
          sideOffset={4}
          className="w-52"
        >
          {openPr === null ? null : (
            <DropdownMenuItem
              render={<a href={openPr.href} target="_blank" rel="noreferrer" />}
            >
              <GitPullRequestCreateArrow strokeWidth={1.75} />
              {openPr.label}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem render={<a {...link} />}>
            <ArrowUpRight strokeWidth={1.75} />
            {m.git_open_branch_item()}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => void navigator.clipboard.writeText(branch)}
          >
            <Copy strokeWidth={1.75} />
            {m.git_copy_branch_name_label()}
          </DropdownMenuItem>
          {canStackBranch && (
            <BranchPickerSubmenu
              mode="stack"
              ticket={ticket}
              github={github}
              onDone={() => setOpen(false)}
              label={
                <>
                  <Layers strokeWidth={1.75} />
                  {m.git_stack_add_button()}
                </>
              }
            />
          )}
          {removable && <DropdownMenuSeparator />}
          {removal.kind === "stack" ? (
            <DropdownMenuItem
              disabled={removal.busy}
              onClick={removal.onRemove}
            >
              <X strokeWidth={1.75} />
              {m.git_stack_remove_item()}
            </DropdownMenuItem>
          ) : canClear ? (
            <ConfirmButton.MenuItem variant="destructive">
              <Unlink strokeWidth={1.75} />
              {m.git_branch_remove_item()}
            </ConfirmButton.MenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {removal.kind === "ticket" && canClear ? (
        <ConfirmButton.Popover anchor={anchor} className="w-72">
          <RemoveBranchAction ticket={ticket} />
        </ConfirmButton.Popover>
      ) : null}
    </ConfirmButton.Root>
  )
}

function RemoveBranchAction({ ticket }: Readonly<{ ticket: TicketDetail }>) {
  const { orgSlug, slug } = useProjectRoute()
  const atom = clearBranch({
    req: projectRequest(orgSlug, slug),
    id: ticket.id
  })
  const clear = useAtomSet(atom, { mode: "promiseExit" })
  const state = useAtomValue(atom)
  return (
    <ConfirmButton.Action
      layout="stacked"
      prompt={m.git_branch_remove_prompt()}
      description={m.git_branch_remove_description()}
      label={m.git_branch_remove_confirm()}
      waiting={state.waiting}
      error={Result.isFailure(state) ? m.git_branch_remove_error() : null}
      onConfirm={() => clear()}
    />
  )
}
