import { RegistryContext, useAtomSet } from "@effect/atom-react"
import type { GithubConnection, TicketDetail } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { GitBranch, Plus } from "lucide-react"
import { useContext, useState, type ReactElement, type RefObject } from "react"

import { fireMutation } from "@/api/viewMutation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuList,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { MiddleTruncate } from "@/components/ui/middle-truncate"
import {
  attachBranch,
  branchAttempt,
  branches,
  branchesRequest,
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
import { m } from "@/paraglide/messages"

import { BranchPagingNote, BranchResultsFrame } from "./BranchPickerNotes"
import { BranchBadge } from "./BranchPickerOptions"
import { CreateBranchSubmenu } from "./CreateBranchSubmenu"

export type BranchPickerMode = "link" | "stack"

type BranchPickerProps = Readonly<{
  ticket: TicketDetail
  github: GithubConnection
  branchTemplate?: string | null
  mode: BranchPickerMode
}>

type BranchPickerPlacement = Readonly<{
  align?: "start" | "end"
}> &
  (
    | Readonly<{ trigger: ReactElement }>
    | Readonly<{
        anchor: RefObject<HTMLElement | null>
        open: boolean
        onOpenChange: (open: boolean) => void
      }>
  )

export function BranchPicker(props: BranchPickerProps & BranchPickerPlacement) {
  usePreloadBranches()
  const { ticket, github, align = "end" } = props
  const setAttempt = useAtomSet(branchAttempt(ticket.id))
  const [ownOpen, setOwnOpen] = useState(false)
  const [query, setQuery] = useState("")
  const controlled = "anchor" in props
  const open = controlled ? props.open : ownOpen
  const setOpen = controlled ? props.onOpenChange : setOwnOpen

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
      {"trigger" in props ? (
        <DropdownMenuTrigger render={props.trigger} />
      ) : null}
      <DropdownMenuContent
        anchor={controlled ? props.anchor : undefined}
        align={align}
        sideOffset={6}
        className="flex w-80 flex-col"
      >
        <BranchPickerList
          ticket={ticket}
          github={github}
          branchTemplate={props.branchTemplate}
          mode={props.mode}
          query={query}
          onDone={() => setOpen(false)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function BranchPickerList({
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

  const placeholder = canCreate
    ? m.git_branch_picker_placeholder()
    : m.git_search_branches_placeholder()

  return (
    <>
      <DropdownMenuInput
        placeholder={placeholder}
        aria-label={placeholder}
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
              <CreateBranchSubmenu
                key={`create:${entry.name}`}
                ticket={ticket}
                github={github}
                suggestedName={entry.name}
                onDone={onDone}
              />
            ) : (
              <DropdownMenuItem
                key={`branch:${entry.branch.name}`}
                label={entry.branch.name}
                onClick={() => void connect(entry.branch.name)}
              >
                <GitBranch strokeWidth={1.75} />
                <MiddleTruncate
                  value={entry.branch.name}
                  className="flex-1 font-mono text-foreground"
                />
                <BranchBadge branch={entry.branch} defaultBase={defaultBase} />
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuList>
      </BranchResultsFrame>
      <BranchPagingNote results={results} />
    </>
  )
}
