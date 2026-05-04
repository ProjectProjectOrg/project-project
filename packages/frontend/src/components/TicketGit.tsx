// TicketGit — UI surfaces for a ticket's GitHub state.
//
// Two exports:
//   TicketGitChip  — tiny badge for collapsed list rows
//   TicketGitPanel — full inline panel for the expanded ticket view, with
//                    inline create-branch and open-PR flows (no dialogs).
//
// Both consume `projectGitStatesAtom` keyed by project slug.

import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  Plus,
  X
} from "lucide-react"
import {
  clearBranchAtom,
  createBranchAtom,
  openPrAtom,
  projectGitStatesAtom
} from "@/atoms/github"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type {
  GitState,
  GithubConnection,
  TicketDetail,
  TicketId
} from "@projectproject/shared"

// --- Helpers --------------------------------------------------------------

function useGitState(slug: string, ticketId: string): GitState | null {
  const states = useAtomValue(projectGitStatesAtom(slug))
  if (!Result.isSuccess(states)) return null
  return states.value.states[ticketId] ?? null
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
}

// Build a default branch name from `branchTemplate` placeholders.
function defaultBranchName(
  template: string | null,
  type: string,
  id: string,
  title: string
): string {
  const tpl = template ?? "{type}/{id}-{slug}"
  return tpl
    .replace("{type}", type)
    .replace("{id}", id)
    .replace("{slug}", slugify(title))
}

// --- TicketGitChip --------------------------------------------------------

export function TicketGitChip({
  slug,
  ticketId
}: {
  slug: string
  ticketId: TicketId
}) {
  const state = useGitState(slug, ticketId)
  if (!state || state.tag === "no_branch") return null

  if (state.tag === "stale_branch") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
        title={`Branch "${state.name}" not on remote`}
      >
        <AlertTriangle className="size-3" strokeWidth={1.75} />
        stale
      </span>
    )
  }

  if (state.tag === "branch_no_pr") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
        title={state.name}
      >
        <GitBranch className="size-3" strokeWidth={1.75} />
        {truncate(state.name)}
      </span>
    )
  }

  if (state.tag === "pr_open") {
    const checkColor = checksColor(state.checks)
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
          state.draft
            ? "bg-muted text-muted-foreground"
            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        )}
        title={state.title}
      >
        <GitPullRequest className="size-3" strokeWidth={1.75} />
        #{state.number}
        {state.checks !== "none" && (
          <Circle
            className={cn("size-2 fill-current", checkColor)}
            strokeWidth={0}
          />
        )}
        {state.draft && <span>draft</span>}
      </span>
    )
  }

  if (state.tag === "pr_merged") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-400"
        title={state.title}
      >
        <GitMerge className="size-3" strokeWidth={1.75} />
        #{state.number}
      </span>
    )
  }

  if (state.tag === "pr_closed") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
        title={state.title}
      >
        <GitPullRequestClosed className="size-3" strokeWidth={1.75} />
        #{state.number}
      </span>
    )
  }

  return null
}

function truncate(name: string, max = 18) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

function checksColor(s: string): string {
  if (s === "passing") return "text-emerald-500"
  if (s === "failing") return "text-red-500"
  if (s === "pending") return "text-amber-500"
  return "text-muted-foreground"
}

// --- TicketGitPanel -------------------------------------------------------

export function TicketGitPanel({
  slug,
  ticket,
  github,
  branchTemplate
}: {
  slug: string
  ticket: TicketDetail
  github: GithubConnection | null
  branchTemplate: string | null
}) {
  const state = useGitState(slug, ticket.id)
  const [mode, setMode] = useState<"idle" | "create_branch" | "open_pr">(
    "idle"
  )

  if (!github) {
    return null
  }

  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      {state === null ? (
        <Loading />
      ) : (
        <StateBody
          slug={slug}
          ticket={ticket}
          state={state}
          github={github}
          branchTemplate={branchTemplate}
          mode={mode}
          setMode={setMode}
        />
      )}
    </div>
  )
}

function Loading() {
  return (
    <div className="h-7 w-44 animate-pulse rounded bg-muted/60" />
  )
}

function StateBody({
  slug,
  ticket,
  state,
  github,
  branchTemplate,
  mode,
  setMode
}: {
  slug: string
  ticket: TicketDetail
  state: GitState
  github: GithubConnection
  branchTemplate: string | null
  mode: "idle" | "create_branch" | "open_pr"
  setMode: (m: "idle" | "create_branch" | "open_pr") => void
}) {
  if (mode === "create_branch") {
    return (
      <CreateBranchRow
        slug={slug}
        ticket={ticket}
        github={github}
        branchTemplate={branchTemplate}
        onClose={() => setMode("idle")}
      />
    )
  }
  if (mode === "open_pr" && (state.tag === "branch_no_pr" || state.tag === "pr_closed")) {
    return (
      <OpenPrRow
        slug={slug}
        ticket={ticket}
        branch={state.tag === "branch_no_pr" ? state.name : state.branch}
        onClose={() => setMode("idle")}
      />
    )
  }

  if (state.tag === "no_branch") {
    return (
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">No branch yet.</span>
        <Button size="sm" leadingIcon={Plus} onClick={() => setMode("create_branch")}>
          Create branch
        </Button>
      </div>
    )
  }

  if (state.tag === "branch_no_pr") {
    return (
      <Row>
        <BranchChip slug={`${github.repoOwner}/${github.repoName}`} name={state.name} />
        <div className="flex-1" />
        <Button size="sm" leadingIcon={GitPullRequest} onClick={() => setMode("open_pr")}>
          Open PR
        </Button>
        <ClearBranchButton slug={slug} id={ticket.id} />
      </Row>
    )
  }

  if (state.tag === "pr_open") {
    return (
      <Row>
        <BranchChip slug={`${github.repoOwner}/${github.repoName}`} name={state.branch} />
        <PrLink
          slug={slug}
          id={ticket.id}
          number={state.number}
          tone={state.draft ? "draft" : "open"}
          checks={state.checks}
        />
        <span className="text-xs text-muted-foreground truncate">
          {state.title}
        </span>
      </Row>
    )
  }

  if (state.tag === "pr_merged") {
    return (
      <Row>
        <BranchChip slug={`${github.repoOwner}/${github.repoName}`} name={state.branch} />
        <PrLink slug={slug} id={ticket.id} number={state.number} tone="merged" />
        <span className="text-xs text-muted-foreground">
          merged · ticket auto-set to done
        </span>
      </Row>
    )
  }

  if (state.tag === "pr_closed") {
    return (
      <Row>
        <BranchChip slug={`${github.repoOwner}/${github.repoName}`} name={state.branch} />
        <PrLink slug={slug} id={ticket.id} number={state.number} tone="closed" />
        <div className="flex-1" />
        <Button
          size="sm"
          variant="tertiary"
          leadingIcon={GitPullRequest}
          onClick={() => setMode("open_pr")}
        >
          Open new PR
        </Button>
      </Row>
    )
  }

  if (state.tag === "stale_branch") {
    return (
      <Row>
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3.5" strokeWidth={1.75} />
          Branch <span className="font-mono">{state.name}</span> not on remote.
        </span>
        <div className="flex-1" />
        <ClearBranchButton slug={slug} id={ticket.id} label="Clear" />
      </Row>
    )
  }

  return null
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>
}

function BranchChip({ slug, name }: { slug: string; name: string }) {
  return (
    <a
      href={`https://github.com/${slug}/tree/${name}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:text-foreground"
    >
      <GitBranch className="size-3" strokeWidth={1.75} />
      {name}
      <ArrowUpRight className="size-3" strokeWidth={1.75} />
    </a>
  )
}

function PrLink({
  slug,
  id,
  number,
  tone,
  checks
}: {
  slug: string
  id: TicketId
  number: number
  tone: "open" | "draft" | "merged" | "closed"
  checks?: string
}) {
  const tint =
    tone === "merged"
      ? "bg-violet-500/10 text-violet-700 dark:text-violet-400"
      : tone === "closed"
        ? "bg-muted text-muted-foreground"
        : tone === "draft"
          ? "bg-muted text-muted-foreground"
          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
  const Icon =
    tone === "merged"
      ? GitMerge
      : tone === "closed"
        ? GitPullRequestClosed
        : GitPullRequest
  return (
    <Link
      to="/projects/$slug/tickets/$id/review"
      params={{ slug, id }}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        tint
      )}
    >
      <Icon className="size-3" strokeWidth={1.75} />#{number}
      {checks && checks !== "none" && (
        <Circle
          className={cn("size-2 fill-current", checksColor(checks))}
          strokeWidth={0}
        />
      )}
      {tone === "draft" && <span>draft</span>}
    </Link>
  )
}

// --- Inline create-branch row --------------------------------------------

function CreateBranchRow({
  slug,
  ticket,
  github,
  branchTemplate,
  onClose
}: {
  slug: string
  ticket: TicketDetail
  github: GithubConnection
  branchTemplate: string | null
  onClose: () => void
}) {
  const [name, setName] = useState(() =>
    defaultBranchName(branchTemplate, ticket.type, ticket.id, ticket.title)
  )
  const [base, setBase] = useState(github.defaultBaseBranch ?? "")
  const create = useAtomSet(createBranchAtom)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await create({
        slug,
        id: ticket.id,
        name: name.trim(),
        baseBranch: base.trim() || undefined
      })
      onClose()
    } catch (e) {
      const tag =
        typeof e === "object" && e && "_tag" in e ? String(e._tag) : ""
      setError(
        tag === "BranchExists"
          ? `Branch "${name.trim()}" already exists.`
          : tag === "BranchProtected"
            ? "Branch name is protected."
            : tag === "GitHubTokenExpired"
              ? "GitHub token expired."
              : tag === "GitHubScopeInsufficient"
                ? "GitHub scope insufficient."
                : tag === "RepoGone"
                  ? "Repo not accessible."
                  : "Couldn't create branch."
      )
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
        <label className="block text-xs">
          <span className="text-muted-foreground">Branch name</span>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-0.5 h-8 font-mono"
            placeholder="feat/T-12-add-button"
            disabled={busy}
          />
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">Base branch</span>
          <Input
            value={base}
            onChange={(e) => setBase(e.target.value)}
            className="mt-0.5 h-8 font-mono"
            placeholder={github.defaultBaseBranch ?? "main"}
            disabled={busy}
          />
        </label>
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          leadingIcon={X}
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          leadingIcon={CheckCircle2}
          onClick={() => void submit()}
          disabled={busy || !name.trim()}
        >
          {busy ? "Creating…" : "Create branch"}
        </Button>
      </div>
    </div>
  )
}

// --- Inline open-PR row ---------------------------------------------------

function OpenPrRow({
  slug,
  ticket,
  branch,
  onClose
}: {
  slug: string
  ticket: TicketDetail
  branch: string
  onClose: () => void
}) {
  const [title, setTitle] = useState(ticket.title)
  const [draft, setDraft] = useState(false)
  const open = useAtomSet(openPrAtom)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await open({
        slug,
        id: ticket.id,
        title: title.trim() || undefined,
        draft
      })
      onClose()
    } catch (e) {
      const tag =
        typeof e === "object" && e && "_tag" in e ? String(e._tag) : ""
      setError(
        tag === "BranchProtected"
          ? "Target branch is protected."
          : tag === "GitHubTokenExpired"
            ? "GitHub token expired."
            : tag === "GitHubScopeInsufficient"
              ? "GitHub scope insufficient."
              : tag === "RepoGone"
                ? "Repo not accessible."
                : "Couldn't open PR — make sure the branch has commits."
      )
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Open PR from{" "}
        <span className="font-mono text-foreground">{branch}</span>
      </p>
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-8"
        placeholder="PR title"
        disabled={busy}
      />
      <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={draft}
          onChange={(e) => setDraft(e.target.checked)}
          disabled={busy}
        />
        Open as draft
      </label>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" leadingIcon={X} onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" leadingIcon={GitPullRequest} onClick={() => void submit()} disabled={busy}>
          {busy ? "Opening…" : "Open PR"}
        </Button>
      </div>
    </div>
  )
}

function ClearBranchButton({
  slug,
  id,
  label = "Clear branch"
}: {
  slug: string
  id: TicketId
  label?: string
}) {
  const clear = useAtomSet(clearBranchAtom)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-muted-foreground transition-colors hover:text-destructive"
      >
        {label}
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await clear({ slug, id })
          } finally {
            setBusy(false)
            setConfirming(false)
          }
        }}
        className="text-destructive hover:underline"
      >
        Confirm
      </button>
      <span className="text-muted-foreground">·</span>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-muted-foreground hover:underline"
      >
        Cancel
      </button>
    </span>
  )
}
