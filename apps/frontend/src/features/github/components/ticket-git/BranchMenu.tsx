import { useAtomSet } from "@effect/atom-react"
import type { GithubConnection, TicketDetail } from "@pp/shared"
import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuConfirmItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
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

import { clearBranch } from "@/features/github/atoms/github"
import { repoSlug } from "@/features/github/lib/repos"
import { projectRequest } from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useProjectActor } from "@/hooks/useActor"
import { describeCause } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

import { usePreferredBranchLink } from "./BranchChip"
import { BranchPicker } from "./BranchPicker"

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
  const link = usePreferredBranchLink(repoSlug(github), branch)
  const actor = useProjectActor()
  const canClear = actor.call("tickets", "clearBranch")
  const canStackBranch = canStack && actor.call("tickets", "stackBranch")
  const anchor = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [stacking, setStacking] = useState(false)
  const removable = removal.kind === "stack" || canClear

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <span ref={anchor} className="inline-flex max-w-full min-w-0">
          <DropdownMenuTrigger
            render={
              trigger ?? (
                <Button
                  variant="ghost"
                  size="square-7"
                  aria-label={m.git_stack_branch_menu_label({ branch })}
                >
                  <MoreHorizontal className="size-4" />
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
              <GitPullRequestCreateArrow />
              {openPr.label}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem render={<a {...link} />}>
            <ArrowUpRight />
            {m.git_open_branch_item()}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => void navigator.clipboard.writeText(branch)}
          >
            <Copy />
            {m.git_copy_branch_name_label()}
          </DropdownMenuItem>
          {canStackBranch && (
            <DropdownMenuItem onClick={() => setStacking(true)}>
              <Layers />
              {m.git_stack_add_button()}
            </DropdownMenuItem>
          )}
          {removable && <DropdownMenuSeparator />}
          {removal.kind === "stack" ? (
            <DropdownMenuItem
              disabled={removal.busy}
              onClick={removal.onRemove}
            >
              <X />
              {m.git_stack_remove_item()}
            </DropdownMenuItem>
          ) : canClear ? (
            <RemoveBranchItem ticket={ticket} />
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {canStackBranch && (
        <BranchPicker
          mode="stack"
          ticket={ticket}
          github={github}
          anchor={anchor}
          align={trigger === undefined ? "end" : "start"}
          open={stacking}
          onOpenChange={setStacking}
        />
      )}
    </>
  )
}

// "Unlink branch" in a branch's menus: confirms in place, then the menu
// closes.
export function RemoveBranchItem({
  ticket
}: Readonly<{ ticket: Pick<TicketDetail, "id"> }>) {
  const { orgSlug, slug } = useProjectRoute()
  const clear = useAtomSet(
    clearBranch({ req: projectRequest(orgSlug, slug), id: ticket.id }),
    { mode: "promiseExit" }
  )
  return (
    <DropdownMenuConfirmItem
      icon={<Unlink />}
      label={m.git_branch_remove_item()}
      confirmLabel={m.git_branch_remove_prompt()}
      busyLabel={m.git_branch_remove_in_progress()}
      describeError={describeCause}
      onConfirm={() => clear()}
    />
  )
}
