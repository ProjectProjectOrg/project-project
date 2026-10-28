import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { TicketStatus } from "@pp/shared"
import type { BranchListItem, GithubConnection, TicketDetail } from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import type * as Atom from "effect/reactivity/Atom"
import { GitBranch, Plus } from "lucide-react"
import { useState, type ReactElement } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuList,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  attachBranch,
  createBranch,
  stackBranch
} from "@/features/github/atoms/github"
import { MenuNote } from "@/features/github/components/MenuNote"
import { useBranchResults } from "@/features/github/hooks/useBranchResults"
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
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { BranchPagingNote, BranchResultsNote } from "./BranchPickerNotes"
import { BaseBranchSubmenu, StatusSubmenu } from "./BranchPickerOptions"

export type BranchPickerMode = "link" | "stack"

type BranchPickerProps = Readonly<{
  ticket: TicketDetail
  github: GithubConnection
  branchTemplate?: string | null
  mode: BranchPickerMode
}>

type SubmitAction = "create" | "attach"

export function BranchPicker({
  trigger,
  align = "end",
  ...props
}: BranchPickerProps &
  Readonly<{ trigger: ReactElement; align?: "start" | "end" }>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
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
      <DropdownMenuContent align={align} sideOffset={6} className="w-80">
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
  const results = useBranchResults(github, query)
  const defaultBase = github.defaultBaseBranch ?? "main"
  const [base, setBase] = useState(defaultBase)
  const [status, setStatus] = useState(TicketStatus.make("in_progress"))
  const [pending, setPending] = useState<string | null>(null)
  const [attempt, setAttempt] = useState<Readonly<{
    action: SubmitAction
    name: string
  }> | null>(null)

  const request = { req: projectRequest(orgSlug, slug), id: ticket.id }
  const create = useAtomSet(createBranch(request), { mode: "promiseExit" })
  const createState = useAtomValue(createBranch(request))
  const attachAtom =
    mode === "stack" ? stackBranch(request) : attachBranch(request)
  const attach = useAtomSet(attachAtom, { mode: "promiseExit" })
  const attachState = useAtomValue(attachAtom)
  const updateTicket = useAtomSet(
    updateTicketDetail(ticketRequest(orgSlug, slug, ticket.id))
  )

  const canCreate = mode === "link"
  const entries = branchPickerEntries({
    query,
    suggested: defaultBranchName(
      branchTemplate,
      ticket.type,
      ticket.id,
      ticket.title
    ),
    items: results.view?.items ?? [],
    canCreate
  })

  const errorText =
    attempt === null || pending !== null
      ? null
      : attempt.action === "create"
        ? createErrorText(createState, attempt.name)
        : attachErrorText(attachState, attempt.name)

  function begin(action: SubmitAction, name: string): boolean {
    if (pending !== null) return false
    setPending(name)
    setAttempt({ action, name })
    return true
  }

  async function createNamed(name: string) {
    if (!begin("create", name)) return
    const exit = await create({ name, baseBranch: base })
    setPending(null)
    if (Exit.isFailure(exit)) return
    if (status !== ticket.status) updateTicket({ status })
    onDone()
  }

  async function connect(name: string) {
    if (!begin("attach", name)) return
    const exit = await attach({ name })
    setPending(null)
    if (Exit.isSuccess(exit)) {
      onDone()
      return
    }
    const failure = Cause.findErrorOption(exit.cause)
    if (
      Option.isSome(failure) &&
      Predicate.isTagged(failure.value, "BranchNotFound")
    ) {
      results.refresh()
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
        className="font-mono"
      />
      {errorText === null ? null : (
        <MenuNote tone="error">{errorText}</MenuNote>
      )}
      <BranchResultsNote results={results} empty={entries.length === 0} />
      <DropdownMenuList
        className="max-h-64 overflow-y-auto"
        onScroll={results.onScroll}
      >
        {entries.map((entry) =>
          entry.kind === "create" ? (
            <DropdownMenuItem
              key={`create:${entry.name}`}
              label={entry.name}
              closeOnClick={false}
              onClick={() => void createNamed(entry.name)}
            >
              <Plus strokeWidth={1.75} />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  pending === entry.name && "animate-pulse"
                )}
              >
                {m.git_branch_picker_create()}{" "}
                <span className="font-mono text-foreground">{entry.name}</span>
              </span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={`branch:${entry.branch.name}`}
              label={entry.branch.name}
              closeOnClick={false}
              onClick={() => void connect(entry.branch.name)}
            >
              <GitBranch strokeWidth={1.75} />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-mono",
                  pending === entry.branch.name && "animate-pulse"
                )}
              >
                {entry.branch.name}
              </span>
              <BranchBadge branch={entry.branch} defaultBase={defaultBase} />
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuList>
      <BranchPagingNote view={results.view} />
      {canCreate ? (
        <>
          <DropdownMenuSeparator />
          <BaseBranchSubmenu github={github} value={base} onChange={setBase} />
          <StatusSubmenu value={status} onChange={setStatus} />
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

function createErrorText(
  state: Atom.Type<ReturnType<typeof createBranch>>,
  name: string
): string | null {
  return mutationErrorText(
    state,
    (error) =>
      Match.value(error).pipe(
        Match.tag("BranchExists", () => m.git_branch_exists_error({ name })),
        Match.tag("BranchProtected", () => m.git_branch_protected_error()),
        Match.tag("GitHubTokenExpired", () =>
          m.git_github_token_expired_error()
        ),
        Match.tag("GitHubScopeInsufficient", () =>
          m.git_github_scope_insufficient_error()
        ),
        Match.tag("RepoGone", () => m.git_repo_gone_error()),
        Match.orElse(() => m.git_create_branch_error())
      ),
    m.git_create_branch_error
  )
}

function attachErrorText(
  state: Atom.Type<ReturnType<typeof attachBranch>>,
  name: string
): string | null {
  return mutationErrorText(
    state,
    (error) =>
      Match.value(error).pipe(
        Match.tag("BranchNotFound", () =>
          m.git_branch_not_found_error({ name })
        ),
        Match.tag("GitHubTokenExpired", () =>
          m.git_github_token_expired_error()
        ),
        Match.tag("GitHubScopeInsufficient", () =>
          m.git_github_scope_insufficient_error()
        ),
        Match.tag("RepoGone", () => m.git_repo_gone_error()),
        Match.tag("Conflict", ({ reason }) =>
          Match.value(reason).pipe(
            Match.when("branch_on_other_ticket", () =>
              m.git_stack_branch_on_other_ticket_error()
            ),
            Match.when("branch_already_on_ticket", () =>
              m.git_stack_branch_already_on_ticket_error()
            ),
            Match.orElse(() => m.git_attach_branch_error())
          )
        ),
        Match.orElse(() => m.git_attach_branch_error())
      ),
    m.git_attach_branch_error
  )
}
