import { Result, useAtomValue } from "@effect-atom/atom-react"
import {
  AlertTriangle,
  ArrowUpRight,
  Circle,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  Plus
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { CopyButton } from "@/components/ui/copy-button"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"
import { projectGitStatesAtom } from "@/atoms/github"
import { projectKey } from "@/atoms/projects"
import { ClearBranchFields } from "@/components/TicketGit/ClearBranchFields"
import { ConnectBranchFields } from "@/components/TicketGit/ConnectBranchFields"
import { CreateBranchFields } from "@/components/TicketGit/CreateBranchFields"
import { Button } from "@/components/ui/button"
import { InlineForm } from "@/components/ui/inline-form"
import { cn } from "@/lib/utils"
import type {
  GitState,
  GithubConnection,
  TicketDetail,
  TicketId
} from "@projectproject/shared"

function useGitState(
  orgSlug: string,
  slug: string,
  ticketId: string
): { state: GitState | null; waiting: boolean } {
  const states = useAtomValue(
    projectGitStatesAtom(projectKey(orgSlug, slug))
  )
  if (!Result.isSuccess(states)) return { state: null, waiting: false }
  return {
    state: states.value.states[ticketId] ?? null,
    waiting: states.waiting
  }
}

function truncate(name: string, max = 18) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

function compareUrl(repoSlug: string, base: string, branch: string): string {
  return `https://github.com/${repoSlug}/compare/${base}...${branch}?quick_pull=1`
}

function checksColor(s: string): string {
  if (s === "passing") return "text-emerald-500"
  if (s === "failing") return "text-red-500"
  if (s === "pending") return "text-amber-500"
  return "text-muted-foreground"
}

export function TicketGitChip({
  orgSlug,
  slug,
  ticketId
}: {
  orgSlug: string
  slug: string
  ticketId: TicketId
}) {
  const { state, waiting } = useGitState(orgSlug, slug, ticketId)
  const project = useProject()
  if (!state || state.tag === "no_branch") return <span aria-hidden />
  const pulse = waiting && "animate-pulse"
  const repoSlug = project.github
    ? `${project.github.repoOwner}/${project.github.repoName}`
    : null

  if (state.tag === "stale_branch") {
    return (
      <Badge
        tone="amber"
        size="xs"
        className={cn(pulse)}
        title={`Branch "${state.name}" not on remote`}
      >
        <AlertTriangle strokeWidth={1.75} />
        stale
      </Badge>
    )
  }

  if (state.tag === "branch_no_pr") {
    if (!repoSlug) {
      return (
        <Badge
          tone="muted"
          size="xs"
          className={cn("font-mono", pulse)}
          title={state.name}
        >
          <GitBranch strokeWidth={1.75} />
          {truncate(state.name)}
        </Badge>
      )
    }
    return (
      <span className={cn(pulse)}>
        <BranchChip
          slug={repoSlug}
          name={state.name}
          displayName={truncate(state.name)}
          variant="ghost"
        />
      </span>
    )
  }

  if (state.tag === "pr_open") {
    return (
      <span className={cn(pulse)}>
        <PrLink
          number={state.number}
          url={state.url}
          tone={state.draft ? "draft" : "open"}
          checks={state.checks}
        />
      </span>
    )
  }

  if (state.tag === "pr_merged") {
    return (
      <span className={cn(pulse)}>
        <PrLink number={state.number} url={state.url} tone="merged" />
      </span>
    )
  }

  if (state.tag === "pr_closed") {
    return (
      <span className={cn(pulse)}>
        <PrLink number={state.number} url={state.url} tone="closed" />
      </span>
    )
  }

  return null
}

export function TicketGitPanel({
  orgSlug,
  slug,
  ticket,
  github,
  branchTemplate
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  github: GithubConnection | null
  branchTemplate: string | null
}) {
  const { state, waiting } = useGitState(orgSlug, slug, ticket.id)
  if (!github) return null
  if (state === null) {
    return (
      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <div className="skeleton h-7 w-44 rounded bg-muted/60" />
      </div>
    )
  }
  return (
    <PanelForState
      orgSlug={orgSlug}
      slug={slug}
      ticket={ticket}
      state={state}
      waiting={waiting}
      github={github}
      branchTemplate={branchTemplate}
    />
  )
}

function PanelForState({
  orgSlug,
  slug,
  ticket,
  state,
  waiting,
  github,
  branchTemplate
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  state: GitState
  waiting: boolean
  github: GithubConnection
  branchTemplate: string | null
}) {
  const repoSlug = `${github.repoOwner}/${github.repoName}`
  const pulse = waiting && "animate-pulse"

  if (state.tag === "no_branch") {
    type NoBranchAction = "create" | "connect"
    const Root = InlineForm.Root<NoBranchAction>
    const baseBranch = github.defaultBaseBranch ?? "main"
    return (
      <Root>
        <InlineForm.Idle>
          <InlineForm.Display<NoBranchAction>
            previews={{
              create: (
                <span className="text-xs text-muted-foreground">
                  Create a new branch from{" "}
                  <span className="font-mono text-foreground">
                    {baseBranch}
                  </span>
                </span>
              ),
              connect: (
                <span className="text-xs text-muted-foreground">
                  Attach an existing branch from this repo
                </span>
              )
            }}
          >
            <span className="text-xs text-muted-foreground">No branch yet.</span>
          </InlineForm.Display>
          <InlineForm.Actions>
            <InlineForm.Trigger action="create" size="sm" leadingIcon={Plus}>
              Create branch
            </InlineForm.Trigger>
            <InlineForm.Trigger
              action="connect"
              size="sm"
              variant="tertiary"
              leadingIcon={GitBranch}
            >
              Connect branch
            </InlineForm.Trigger>
          </InlineForm.Actions>
        </InlineForm.Idle>
        <InlineForm.Form action="create">
          <CreateBranchFields
            orgSlug={orgSlug}
            slug={slug}
            ticket={ticket}
            github={github}
            branchTemplate={branchTemplate}
          />
        </InlineForm.Form>
        <InlineForm.Form action="connect">
          <ConnectBranchFields
            orgSlug={orgSlug}
            slug={slug}
            ticket={ticket}
          />
        </InlineForm.Form>
      </Root>
    )
  }

  if (state.tag === "branch_no_pr") {
    const baseBranch = github.defaultBaseBranch ?? "main"
    const Root = InlineForm.Root<"clear">
    return (
      <Root>
        <InlineForm.Idle>
          <InlineForm.Display className={cn(pulse)}>
            <BranchChip slug={repoSlug} name={state.name} />
          </InlineForm.Display>
          <InlineForm.Actions>
            <Button asChild size="sm" leadingIcon={GitPullRequest}>
              <a
                href={compareUrl(repoSlug, baseBranch, state.name)}
                target="_blank"
                rel="noreferrer"
              >
                Open PR
              </a>
            </Button>
            <InlineForm.Trigger action="clear" size="sm" variant="ghost">
              Clear
            </InlineForm.Trigger>
          </InlineForm.Actions>
        </InlineForm.Idle>
        <InlineForm.Form action="clear">
          <ClearBranchFields
            orgSlug={orgSlug}
            slug={slug}
            id={ticket.id}
          />
        </InlineForm.Form>
      </Root>
    )
  }

  if (state.tag === "pr_open") {
    return (
      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <div
          className={cn("flex flex-wrap items-center gap-2", pulse)}
        >
          <BranchChip slug={repoSlug} name={state.branch} />
          <PrLink
            number={state.number}
            url={state.url}
            tone={state.draft ? "draft" : "open"}
            checks={state.checks}
          />
          <span className="text-xs text-muted-foreground truncate">
            {state.title}
          </span>
        </div>
      </div>
    )
  }

  if (state.tag === "pr_merged") {
    return (
      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <div
          className={cn("flex flex-wrap items-center gap-2", pulse)}
        >
          <BranchChip slug={repoSlug} name={state.branch} />
          <PrLink number={state.number} url={state.url} tone="merged" />
          <span className="text-xs text-muted-foreground">
            merged · ticket auto-set to done
          </span>
        </div>
      </div>
    )
  }

  if (state.tag === "pr_closed") {
    const baseBranch = github.defaultBaseBranch ?? "main"
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
        <div className={cn("flex items-center gap-2", pulse)}>
          <BranchChip slug={repoSlug} name={state.branch} />
          <PrLink number={state.number} url={state.url} tone="closed" />
        </div>
        <div className="ml-auto">
          <Button
            asChild
            size="sm"
            variant="tertiary"
            leadingIcon={GitPullRequest}
          >
            <a
              href={compareUrl(repoSlug, baseBranch, state.branch)}
              target="_blank"
              rel="noreferrer"
            >
              Open new PR
            </a>
          </Button>
        </div>
      </div>
    )
  }

  if (state.tag === "stale_branch") {
    const Root = InlineForm.Root<"clear">
    return (
      <Root>
        <InlineForm.Idle>
          <InlineForm.Display className={cn(pulse)}>
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5" strokeWidth={1.75} />
              Branch <span className="font-mono">{state.name}</span> not on remote.
            </span>
          </InlineForm.Display>
          <InlineForm.Actions>
            <InlineForm.Trigger action="clear" size="sm" variant="ghost">
              Clear
            </InlineForm.Trigger>
          </InlineForm.Actions>
        </InlineForm.Idle>
        <InlineForm.Form action="clear">
          <ClearBranchFields
            orgSlug={orgSlug}
            slug={slug}
            id={ticket.id}
          />
        </InlineForm.Form>
      </Root>
    )
  }

  return null
}

export function BranchChip({
  slug,
  name,
  displayName,
  variant = "muted"
}: {
  slug: string
  name: string
  displayName?: string
  variant?: "muted" | "ghost"
}) {
  if (variant === "ghost") {
    return (
      <span
        className="inline-flex items-center gap-0.5 font-mono text-xs text-muted-foreground"
        title={name}
      >
        <a
          href={`https://github.com/${slug}/tree/${name}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors duration-100 hover:bg-accent hover:text-foreground"
        >
          <GitBranch className="size-3" strokeWidth={1.75} />
          {displayName ?? name}
          <ArrowUpRight className="size-3" strokeWidth={1.75} />
        </a>
        <CopyButton value={name} copyLabel="Copy branch name" />
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-md bg-muted pr-0.5 font-mono text-xs text-muted-foreground transition-colors duration-100 hover:text-foreground"
      title={name}
    >
      <a
        href={`https://github.com/${slug}/tree/${name}`}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 rounded-md py-0.5 pl-1.5 transition-colors duration-100 hover:text-foreground"
      >
        <GitBranch className="size-3" strokeWidth={1.75} />
        {displayName ?? name}
        <ArrowUpRight className="size-3" strokeWidth={1.75} />
      </a>
      <CopyButton value={name} copyLabel="Copy branch name" />
    </span>
  )
}

export function PrLink({
  number,
  url,
  tone,
  checks
}: {
  number: number
  url: string
  tone: "open" | "draft" | "merged" | "closed"
  checks?: string
}) {
  const badgeTone =
    tone === "merged"
      ? "violet"
      : tone === "closed" || tone === "draft"
        ? "muted"
        : "emerald"
  const Icon =
    tone === "merged"
      ? GitMerge
      : tone === "closed"
        ? GitPullRequestClosed
        : GitPullRequest
  return (
    <Badge asChild tone={badgeTone} size="xs">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        <Icon strokeWidth={1.75} />#{number}
        {checks && checks !== "none" && (
          <Circle
            className={cn("size-2 fill-current", checksColor(checks))}
            strokeWidth={0}
          />
        )}
        {tone === "draft" && <span>draft</span>}
      </a>
    </Badge>
  )
}
