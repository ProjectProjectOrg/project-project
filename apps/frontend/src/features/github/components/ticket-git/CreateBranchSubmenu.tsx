import { TicketStatus } from "@pp/shared"
import type { GithubConnection, TicketDetail } from "@pp/shared"
import {
  DropdownMenuGroup,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@pp/ui/dropdown-menu"
import { Plus } from "@pp/ui/icons"
import { KbdShortcut } from "@pp/ui/kbd"
import { MiddleTruncate } from "@pp/ui/middle-truncate"
import { useState } from "react"

import { useCreateBranch } from "@/features/github/hooks/useCreateBranch"
import {
  branchMenuFilter,
  sanitizeBranchName
} from "@/features/github/lib/branchPicker"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

import { BaseBranchSubmenu, StatusSubmenu } from "./BranchPickerOptions"

export function CreateBranchSubmenu({
  ticket,
  github,
  repoId,
  suggestedName,
  onDone
}: Readonly<{
  ticket: Pick<TicketDetail, "id" | "status">
  github: GithubConnection
  repoId: string | undefined
  suggestedName: string
  onDone: () => void
}>) {
  const createBranch = useCreateBranch(ticket)
  const [name, setName] = useState(suggestedName)
  const defaultBase = github.defaultBaseBranch ?? "main"
  const [base, setBase] = useState(defaultBase)
  const [status, setStatus] = useState(TicketStatus.make("in_progress"))
  const branchName = sanitizeBranchName(name)

  function submit() {
    if (branchName === "") return
    onDone()
    void createBranch({ name: branchName, base, status, repoId })
  }

  return (
    <DropdownMenuSub
      filterable={branchMenuFilter(name, setName, false)}
      onOpenChange={(open) => {
        if (open) setName(suggestedName)
      }}
    >
      <DropdownMenuSubTrigger openOnHover={false} label={suggestedName}>
        <Plus />
        <span className="shrink-0">{m.git_branch_picker_create()}</span>
        <MiddleTruncate
          value={suggestedName}
          title={suggestedName}
          className="-ml-1 flex-1 text-foreground tabular-nums"
        />
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="flex w-72 flex-col">
        <DropdownMenuInput
          placeholder={m.git_branch_create_name_label()}
          aria-label={m.git_branch_create_name_label()}
          spellCheck={false}
          className="tabular-nums placeholder:font-sans"
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return
            const highlighted = event.currentTarget.getAttribute(
              "aria-activedescendant"
            )
            if (!event.shiftKey && highlighted) return
            event.preventDefault()
            event.preventBaseUIHandler()
            submit()
          }}
        />
        <DropdownMenuGroup>
          <BaseBranchSubmenu
            value={base}
            onChange={setBase}
            ticketId={ticket.id}
            defaultBase={defaultBase}
            repoId={repoId}
          />
          <StatusSubmenu value={status} onChange={setStatus} />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={branchName === ""} onClick={submit}>
          <Plus />
          <span className="flex-1">{m.git_branch_create_submit()}</span>
          <KbdShortcut
            data-menu-meta
            aria-hidden
            size="sm"
            keys="shift+↵"
            keyLabels={keyLabels()}
          />
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
