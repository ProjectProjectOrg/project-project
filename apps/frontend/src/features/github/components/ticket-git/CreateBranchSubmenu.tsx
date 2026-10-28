import { TicketStatus } from "@pp/shared"
import type { GithubConnection, TicketDetail } from "@pp/shared"
import { CornerDownLeft, Plus } from "lucide-react"
import { useState } from "react"

import {
  DropdownMenuGroup,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@/components/ui/dropdown-menu"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { MiddleTruncate } from "@/components/ui/middle-truncate"
import { useCreateBranch } from "@/features/github/hooks/useCreateBranch"
import {
  branchMenuFilter,
  sanitizeBranchName
} from "@/features/github/lib/branchPicker"
import { m } from "@/paraglide/messages"

import { BaseBranchSubmenu, StatusSubmenu } from "./BranchPickerOptions"

export function CreateBranchSubmenu({
  ticket,
  github,
  suggestedName,
  onDone
}: Readonly<{
  ticket: TicketDetail
  github: GithubConnection
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
    void createBranch({ name: branchName, base, status })
  }

  return (
    <DropdownMenuSub
      filterable={branchMenuFilter(name, setName, false)}
      onOpenChange={(open) => {
        if (open) setName(suggestedName)
      }}
    >
      <DropdownMenuSubTrigger openOnHover={false} label={suggestedName}>
        <Plus strokeWidth={1.75} />
        <span className="shrink-0">{m.git_branch_picker_create()}</span>
        <MiddleTruncate
          value={suggestedName}
          className="-ml-1 flex-1 font-mono text-foreground"
        />
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="flex w-72 flex-col">
        <DropdownMenuInput
          placeholder={m.git_branch_create_name_label()}
          aria-label={m.git_branch_create_name_label()}
          spellCheck={false}
          className="font-mono placeholder:font-sans"
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
          />
          <StatusSubmenu value={status} onChange={setStatus} />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={branchName === ""}
          onClick={submit}
          className="text-foreground"
        >
          <Plus strokeWidth={1.75} />
          <span className="flex-1">{m.git_branch_create_submit()}</span>
          <KbdGroup data-menu-meta aria-hidden>
            <Kbd size="sm">{m.git_branch_create_key_shift()}</Kbd>
            <Kbd size="sm">
              <CornerDownLeft />
            </Kbd>
          </KbdGroup>
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
