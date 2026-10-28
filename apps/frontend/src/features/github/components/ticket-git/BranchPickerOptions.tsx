import { useAtomValue } from "@effect/atom-react"
import type { GithubConnection, TicketStatus } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { GitBranch } from "lucide-react"
import { useState } from "react"

import {
  DropdownMenuInput,
  DropdownMenuList,
  DropdownMenuRadioGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@/components/ui/dropdown-menu"
import { menuItemMetaClass } from "@/components/ui/menu-styles"
import { useBranchResults } from "@/features/github/hooks/useBranchResults"
import { branchMenuFilter } from "@/features/github/lib/branchPicker"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { boardStatusesFor } from "@/features/sprints/lib/boardUtils"
import {
  statusLabelFor,
  statusMetaFor
} from "@/features/tickets/lib/ticketMeta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { BranchPagingNote, BranchResultsNote } from "./BranchPickerNotes"

export function BaseBranchSubmenu({
  github,
  value,
  onChange
}: Readonly<{
  github: GithubConnection
  value: string
  onChange: (next: string) => void
}>) {
  const [query, setQuery] = useState("")
  return (
    <DropdownMenuSub filterable={branchMenuFilter(query, setQuery, true)}>
      <DropdownMenuSubTrigger>
        <GitBranch strokeWidth={1.75} />
        {m.git_branch_picker_base_label()}
        <span data-menu-meta className={cn(menuItemMetaClass, "truncate")}>
          {value}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72">
        <BaseBranchOptions
          github={github}
          query={query}
          value={value}
          onChange={onChange}
        />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function BaseBranchOptions({
  github,
  query,
  value,
  onChange
}: Readonly<{
  github: GithubConnection
  query: string
  value: string
  onChange: (next: string) => void
}>) {
  const results = useBranchResults(github, query)
  const items = results.view?.items ?? []
  return (
    <>
      <DropdownMenuInput
        placeholder={m.git_search_branches_placeholder()}
        aria-label={m.git_search_branches_placeholder()}
        className="font-mono"
      />
      <BranchResultsNote results={results} empty={items.length === 0} />
      <DropdownMenuList
        className="max-h-64 overflow-y-auto"
        onScroll={results.onScroll}
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={onChange}
          items={items.map((branch) => ({
            value: branch.name,
            textValue: branch.name,
            label: (
              <span className="min-w-0 flex-1 truncate font-mono">
                {branch.name}
              </span>
            )
          }))}
        />
      </DropdownMenuList>
      <BranchPagingNote view={results.view} />
    </>
  )
}

export function StatusSubmenu({
  value,
  onChange
}: Readonly<{
  value: TicketStatus
  onChange: (next: TicketStatus) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const statusesResult = useAtomValue(
    statusesFor(statusesRequest(orgSlug, slug))
  )
  const statuses = Result.isSuccess(statusesResult) ? statusesResult.value : []
  const current = statusMetaFor(value, statuses)
  const CurrentIcon = current.icon
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <CurrentIcon
          className={current.className}
          style={current.color ? { color: current.color } : undefined}
          strokeWidth={1.75}
        />
        {m.git_branch_picker_status_label()}
        <span data-menu-meta className="ml-auto text-[12px]">
          {statusLabelFor(value, statuses)}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={onChange}
          items={boardStatusesFor(statuses).map((key) => {
            const meta = statusMetaFor(key, statuses)
            const Icon = meta.icon
            return {
              value: key,
              textValue: statusLabelFor(key, statuses),
              label: (
                <>
                  <Icon
                    className={meta.className}
                    style={meta.color ? { color: meta.color } : undefined}
                    strokeWidth={1.75}
                  />
                  {statusLabelFor(key, statuses)}
                </>
              )
            }
          })}
        />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
