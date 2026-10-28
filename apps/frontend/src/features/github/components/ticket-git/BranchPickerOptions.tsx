import { useAtomValue } from "@effect/atom-react"
import type { TicketStatus } from "@pp/shared"
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

import { BranchPagingNote, BranchResultsFrame } from "./BranchPickerNotes"

const OPTION_VALUE =
  "inline-flex max-w-40 min-w-0 items-center gap-1.5 text-foreground"

export function BaseBranchSubmenu({
  value,
  onChange
}: Readonly<{
  value: string
  onChange: (next: string) => void
}>) {
  const [query, setQuery] = useState("")
  return (
    <DropdownMenuSub filterable={branchMenuFilter(query, setQuery, true)}>
      <DropdownMenuSubTrigger>
        <span className="min-w-0 flex-1">
          {m.git_branch_picker_base_label()}
        </span>
        <span data-menu-meta className={OPTION_VALUE}>
          <GitBranch className="size-3.5" strokeWidth={1.75} />
          <span className="truncate font-mono">{value}</span>
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72">
        <BaseBranchOptions query={query} value={value} onChange={onChange} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function BaseBranchOptions({
  query,
  value,
  onChange
}: Readonly<{
  query: string
  value: string
  onChange: (next: string) => void
}>) {
  const results = useBranchResults(query)
  const items = results.view?.items ?? []
  return (
    <>
      <DropdownMenuInput
        placeholder={m.git_search_branches_placeholder()}
        aria-label={m.git_search_branches_placeholder()}
        className="font-mono placeholder:font-sans"
      />
      <BranchResultsFrame results={results} empty={items.length === 0}>
        <DropdownMenuList
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={results.onScroll}
        >
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={onChange}
            items={items.map((branch) => ({
              value: branch.name,
              textValue: branch.name,
              label: (
                <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                  {branch.name}
                </span>
              )
            }))}
          />
        </DropdownMenuList>
      </BranchResultsFrame>
      <BranchPagingNote results={results} />
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
        <span className="min-w-0 flex-1">
          {m.git_branch_picker_status_label()}
        </span>
        <span data-menu-meta className={OPTION_VALUE}>
          <CurrentIcon
            className={cn("size-3.5", current.className)}
            style={current.color ? { color: current.color } : undefined}
            strokeWidth={1.75}
          />
          <span className="truncate">{statusLabelFor(value, statuses)}</span>
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
