import { useAtomValue } from "@effect/atom-react"
import type { BranchListItem, TicketStatus } from "@pp/shared"
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
import { MiddleTruncate } from "@/components/ui/middle-truncate"
import { useBranchResults } from "@/features/github/hooks/useBranchResults"
import {
  baseBranchOrder,
  branchMenuFilter
} from "@/features/github/lib/branchPicker"
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
  "flex min-w-0 flex-1 items-center justify-end gap-1.5 text-foreground"

type BaseBranchProps = Readonly<{
  value: string
  onChange: (next: string) => void
  ticketId: string
  defaultBase: string
}>

export function BaseBranchSubmenu(props: BaseBranchProps) {
  const { value } = props
  const [query, setQuery] = useState("")
  return (
    <DropdownMenuSub filterable={branchMenuFilter(query, setQuery, true)}>
      <DropdownMenuSubTrigger openOnHover={false}>
        <span className="shrink-0 whitespace-nowrap">
          {m.git_branch_picker_base_label()}
        </span>
        <span data-menu-meta className={OPTION_VALUE}>
          <GitBranch className="size-3.5" strokeWidth={1.75} />
          <MiddleTruncate value={value} className="font-mono" />
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72">
        <BaseBranchOptions {...props} query={query} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function BaseBranchOptions({
  query,
  value,
  onChange,
  ticketId,
  defaultBase
}: BaseBranchProps & Readonly<{ query: string }>) {
  const results = useBranchResults(query)
  const items = baseBranchOrder({
    items: results.view?.items ?? [],
    ticketId,
    defaultBase
  })
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
                <>
                  <MiddleTruncate
                    value={branch.name}
                    className="flex-1 font-mono text-foreground"
                  />
                  <BranchBadge branch={branch} defaultBase={defaultBase} />
                </>
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
      <DropdownMenuSubTrigger openOnHover={false}>
        <span className="shrink-0 whitespace-nowrap">
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

export function BranchBadge({
  branch,
  defaultBase
}: Readonly<{ branch: BranchListItem; defaultBase: string }>) {
  const badge =
    branch.name === defaultBase
      ? m.git_branch_default_pill()
      : branch.isProtected
        ? m.git_branch_protected_pill()
        : null
  if (badge === null) return null
  return (
    <span data-menu-meta className="ml-auto text-[11px] text-muted-foreground">
      {badge}
    </span>
  )
}
