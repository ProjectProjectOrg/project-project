import { RegistryContext, useAtomSet } from "@effect/atom-react"
import { TicketStatus } from "@pp/shared"
import type { BranchListItem, GithubConnection, TicketDetail } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { GitBranch, Plus } from "lucide-react"
import { useContext, useState, type ReactElement } from "react"

import { fireMutation } from "@/api/viewMutation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuList,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  attachBranch,
  branchAttempt,
  branches,
  branchesRequest,
  createBranch,
  stackBranch
} from "@/features/github/atoms/github"
import {
  useBranchResults,
  usePreloadBranches
} from "@/features/github/hooks/useBranchResults"
import { useCanCreateBranches } from "@/features/github/hooks/useCanCreateBranches"
import {
  branchMenuFilter,
  branchPickerEntries,
  defaultBranchName
} from "@/features/github/lib/branchPicker"
import { projectRequest } from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  ticketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { m } from "@/paraglide/messages"

import { BranchPagingNote, BranchResultsFrame } from "./BranchPickerNotes"
import { BaseBranchSubmenu, StatusSubmenu } from "./BranchPickerOptions"

export type BranchPickerMode = "link" | "stack"

type BranchPickerProps = Readonly<{
  ticket: TicketDetail
  github: GithubConnection
  branchTemplate?: string | null
  mode: BranchPickerMode
}>

export function BranchPicker({
  trigger,
  align = "end",
  ...props
}: BranchPickerProps &
  Readonly<{ trigger: ReactElement; align?: "start" | "end" }>) {
  usePreloadBranches()
  const setAttempt = useAtomSet(branchAttempt(props.ticket.id))
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (next) setAttempt(null)
        setOpen(next)
      }}
      onOpenChangeComplete={(next) => {
        if (!next) setQuery("")
      }}
      filterable={branchMenuFilter(
        query,
        setQuery,
        props.mode === "link" ? "always" : true
      )}
    >
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent
        align={align}
        sideOffset={6}
        className="flex w-80 flex-col"
      >
        <BranchPickerBody
          {...props}
          query={query}
          onDone={() => setOpen(false)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function BranchPickerSubmenu({
  label,
  onDone,
  ...props
}: BranchPickerProps & Readonly<{ label: ReactElement; onDone: () => void }>) {
  usePreloadBranches()
  const [query, setQuery] = useState("")
  return (
    <DropdownMenuSub filterable={branchMenuFilter(query, setQuery, true)}>
      <DropdownMenuSubTrigger>{label}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-80">
        <BranchPickerBody {...props} query={query} onDone={onDone} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function BranchPickerBody({
  ticket,
  github,
  branchTemplate = null,
  mode,
  query,
  onDone
}: BranchPickerProps & Readonly<{ query: string; onDone: () => void }>) {
  const { orgSlug, slug } = useProjectRoute()
  const results = useBranchResults(query)
  const defaultBase = github.defaultBaseBranch ?? "main"
  const [base, setBase] = useState(defaultBase)
  const [status, setStatus] = useState(TicketStatus.make("in_progress"))
  const registry = useContext(RegistryContext)
  const setAttempt = useAtomSet(branchAttempt(ticket.id))
  const request = { req: projectRequest(orgSlug, slug), id: ticket.id }

  const canCreateBranches = useCanCreateBranches()
  const needsGithub = mode === "link" && !canCreateBranches
  const canCreate = mode === "link" && canCreateBranches
  const entries = branchPickerEntries({
    query,
    suggested: defaultBranchName(
      branchTemplate,
      ticket.type,
      ticket.id,
      ticket.title
    ),
    items: results.view?.items ?? [],
    canCreate,
    ticketId: ticket.id,
    defaultBase
  })

  async function createNamed(name: string) {
    setAttempt({ action: "create", name })
    onDone()
    const result = await fireMutation(registry, createBranch(request), {
      name,
      baseBranch: base
    })
    if (AsyncResult.isSuccess(result) && status !== ticket.status) {
      registry.set(
        updateTicketDetail(ticketRequest(orgSlug, slug, ticket.id)),
        { status }
      )
    }
  }

  async function connect(name: string) {
    setAttempt({ action: mode === "stack" ? "stack" : "attach", name })
    onDone()
    const atom = mode === "stack" ? stackBranch(request) : attachBranch(request)
    const result = await fireMutation(registry, atom, { name })
    if (!AsyncResult.isFailure(result)) return
    const failure = Cause.findErrorOption(result.cause)
    if (
      Option.isSome(failure) &&
      Predicate.isTagged(failure.value, "BranchNotFound")
    ) {
      registry.refresh(branches(branchesRequest(orgSlug, slug, "")))
    }
  }

  return (
    <>
      <DropdownMenuInput
        placeholder={
          canCreate
            ? m.git_branch_picker_placeholder()
            : m.git_search_branches_placeholder()
        }
        aria-label={
          canCreate
            ? m.git_branch_picker_placeholder()
            : m.git_search_branches_placeholder()
        }
        className="font-mono placeholder:font-sans"
      />
      <BranchResultsFrame results={results} empty={entries.length === 0}>
        <DropdownMenuList
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={results.onScroll}
        >
          {needsGithub ? (
            <DropdownMenuItem
              label={m.git_branch_picker_connect_github()}
              render={<Link to="/profile/connections" />}
            >
              <Plus strokeWidth={1.75} />
              {m.git_branch_picker_connect_github()}
            </DropdownMenuItem>
          ) : null}
          {entries.map((entry) =>
            entry.kind === "create" ? (
              <DropdownMenuItem
                key={`create:${entry.name}`}
                label={entry.name}
                onClick={() => void createNamed(entry.name)}
              >
                <Plus strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">
                  {m.git_branch_picker_create()}{" "}
                  <span className="font-mono text-foreground">
                    {entry.name}
                  </span>
                </span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                key={`branch:${entry.branch.name}`}
                label={entry.branch.name}
                onClick={() => void connect(entry.branch.name)}
              >
                <GitBranch strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                  {entry.branch.name}
                </span>
                <BranchBadge branch={entry.branch} defaultBase={defaultBase} />
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuList>
      </BranchResultsFrame>
      <BranchPagingNote results={results} />
      {canCreate ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {m.git_branch_picker_options_label()}
            </DropdownMenuLabel>
            <BaseBranchSubmenu value={base} onChange={setBase} />
            <StatusSubmenu value={status} onChange={setStatus} />
          </DropdownMenuGroup>
        </>
      ) : null}
    </>
  )
}

function BranchBadge({
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
