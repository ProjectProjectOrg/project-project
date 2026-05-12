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
import { m } from "@/paraglide/messages"
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
  const states = useAtomValue(projectGitStatesAtom(projectKey(orgSlug, slug)))
  if (!Result.isSuccess(states)) return { state: null, waiting: false }
  const entry = states.value.states[ticketId]
  return {
    state: entry ?? { tag: "no_branch" },
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
  if (s === "passing") return "text-state-success"
  if (s === "failing") return "text-state-danger"
  if (s === "pending") return "text-state-warning"
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
        title={m.git_stale_branch_title({ name: state.name })}
      >
        <AlertTriangle strokeWidth={1.75} />
        {m.git_stale_branch_pill()}
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
  branchTemplate,
  variant = "bordered"
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  github: GithubConnection | null
  branchTemplate: string | null
  variant?: "bordered" | "ghost"
}) {
  const { state, waiting } = useGitState(orgSlug, slug, ticket.id)
  if (!github) return null
  if (state === null) {
    return (
      <div className={variant === "bordered" ? PANEL_CHROME : undefined}>
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
      variant={variant}
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
  branchTemplate,
  variant
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  state: GitState
  waiting: boolean
  github: GithubConnection
  branchTemplate: string | null
  variant: "bordered" | "ghost"
}) {
  const repoSlug = `${github.repoOwner}/${github.repoName}`
  const pulse = waiting && "animate-pulse"
  const panelChrome = variant === "bordered" ? PANEL_CHROME : undefined
  const buttonSize = variant === "bordered" ? "sm" : "xs"

  if (state.tag === "no_branch") {
    type NoBranchAction = "create" | "connect"
    const Root = InlineForm.Root<NoBranchAction>
    const baseBranch = github.defaultBaseBranch ?? "main"
    return (
      <Root variant={variant} className={GIT_PANEL_CONTAINER}>
        <InlineForm.Idle className={IDLE_STACK}>
          <InlineForm.Display<NoBranchAction>
            previews={{
              create: (
                <span className="text-xs text-muted-foreground">
                  {m.git_create_branch_preview_prefix()}{" "}
                  <span className="font-mono text-foreground">
                    {baseBranch}
                  </span>
                </span>
              ),
              connect: (
                <span className="text-xs text-muted-foreground">
                  {m.git_connect_branch_preview()}
                </span>
              )
            }}
          >
            <span className="text-xs text-muted-foreground">
              {m.git_no_branch_yet()}
            </span>
          </InlineForm.Display>
          <InlineForm.Actions className={ACTIONS_STACK}>
            <InlineForm.Trigger
              action="create"
              size={buttonSize}
              leadingIcon={Plus}
            >
              {m.git_create_branch_button()}
            </InlineForm.Trigger>
            <InlineForm.Trigger
              action="connect"
              size={buttonSize}
              variant="tertiary"
              leadingIcon={GitBranch}
            >
              {m.git_connect_branch_button()}
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
            variant={variant}
          />
        </InlineForm.Form>
        <InlineForm.Form action="connect">
          <ConnectBranchFields
            orgSlug={orgSlug}
            slug={slug}
            ticket={ticket}
            variant={variant}
          />
        </InlineForm.Form>
      </Root>
    )
  }

  if (state.tag === "branch_no_pr") {
    const baseBranch = github.defaultBaseBranch ?? "main"
    const Root = InlineForm.Root<"clear">
    return (
      <Root variant={variant} className={GIT_PANEL_CONTAINER}>
        <InlineForm.Idle className={IDLE_STACK}>
          <InlineForm.Display className={cn(pulse)}>
            <BranchChip slug={repoSlug} name={state.name} />
          </InlineForm.Display>
          <InlineForm.Actions className={ACTIONS_STACK}>
            <Button
              render={
                <a
                  href={compareUrl(repoSlug, baseBranch, state.name)}
                  target="_blank"
                  rel="noreferrer"
                />
              }
              size={buttonSize}
              leadingIcon={GitPullRequest}
            >
              {m.git_open_pr_button()}
            </Button>
            <InlineForm.Trigger
              action="clear"
              size={buttonSize}
              variant="ghost"
            >
              {m.git_clear_branch_button()}
            </InlineForm.Trigger>
          </InlineForm.Actions>
        </InlineForm.Idle>
        <InlineForm.Form action="clear">
          <ClearBranchFields
            orgSlug={orgSlug}
            slug={slug}
            id={ticket.id}
            variant={variant}
          />
        </InlineForm.Form>
      </Root>
    )
  }

  if (state.tag === "pr_open") {
    return (
      <div className={cn(panelChrome, GIT_PANEL_CONTAINER)}>
        <div className={cn(ROW_STACK, pulse)}>
          <BranchChip slug={repoSlug} name={state.branch} />
          <PrLink
            number={state.number}
            url={state.url}
            tone={state.draft ? "draft" : "open"}
            checks={state.checks}
          />
          <span className={WRAPPABLE_TEXT}>{state.title}</span>
        </div>
      </div>
    )
  }

  if (state.tag === "pr_merged") {
    return (
      <div className={cn(panelChrome, GIT_PANEL_CONTAINER)}>
        <div className={cn(ROW_STACK, pulse)}>
          <BranchChip slug={repoSlug} name={state.branch} />
          <PrLink number={state.number} url={state.url} tone="merged" />
          <span className={WRAPPABLE_TEXT}>
            {m.git_pr_merged_status_note()}
          </span>
        </div>
      </div>
    )
  }

  if (state.tag === "pr_closed") {
    const baseBranch = github.defaultBaseBranch ?? "main"
    return (
      <div className={cn(panelChrome, GIT_PANEL_CONTAINER, ROW_STACK)}>
        <div className={cn("flex items-center gap-2", pulse)}>
          <BranchChip slug={repoSlug} name={state.branch} />
          <PrLink number={state.number} url={state.url} tone="closed" />
        </div>
        <div className="ml-auto @max-sm/git-panel:ml-0">
          <Button
            render={
              <a
                href={compareUrl(repoSlug, baseBranch, state.branch)}
                target="_blank"
                rel="noreferrer"
              />
            }
            size={buttonSize}
            variant="tertiary"
            leadingIcon={GitPullRequest}
          >
            {m.git_open_new_pr_button()}
          </Button>
        </div>
      </div>
    )
  }

  if (state.tag === "stale_branch") {
    const Root = InlineForm.Root<"clear">
    return (
      <Root variant={variant} className={GIT_PANEL_CONTAINER}>
        <InlineForm.Idle className={IDLE_STACK}>
          <InlineForm.Display className={cn(pulse)}>
            <div className="flex min-w-0 items-start gap-1.5 text-xs text-state-warning">
              <AlertTriangle
                className="mt-0.5 size-3.5 shrink-0"
                strokeWidth={1.75}
              />
              <span className="min-w-0 break-words">
                {m.git_stale_branch_prefix()}{" "}
                <span className="font-mono">{state.name}</span>{" "}
                {m.git_stale_branch_suffix()}
              </span>
            </div>
          </InlineForm.Display>
          <InlineForm.Actions className={ACTIONS_STACK}>
            <InlineForm.Trigger
              action="clear"
              size={buttonSize}
              variant="ghost"
            >
              {m.git_clear_branch_button()}
            </InlineForm.Trigger>
          </InlineForm.Actions>
        </InlineForm.Idle>
        <InlineForm.Form action="clear">
          <ClearBranchFields
            orgSlug={orgSlug}
            slug={slug}
            id={ticket.id}
            variant={variant}
          />
        </InlineForm.Form>
      </Root>
    )
  }

  return null
}

const PANEL_CHROME = "rounded-lg border border-border bg-background px-3 py-2"
const GIT_PANEL_CONTAINER = "@container/git-panel"
const IDLE_STACK =
  "@max-sm/git-panel:flex-col @max-sm/git-panel:items-stretch"
const ACTIONS_STACK =
  "@max-sm/git-panel:ml-0 @max-3xs/git-panel:flex-col @max-3xs/git-panel:items-stretch"
const ROW_STACK =
  "flex flex-wrap items-center gap-2 @max-sm/git-panel:flex-col @max-sm/git-panel:items-start"
const WRAPPABLE_TEXT =
  "min-w-0 truncate text-xs text-muted-foreground @max-sm/git-panel:whitespace-normal @max-sm/git-panel:overflow-visible"

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
        className="inline-flex min-w-0 max-w-full items-center gap-1.5 font-mono text-xs text-muted-foreground"
        title={name}
      >
        <a
          href={`https://github.com/${slug}/tree/${name}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors duration-100 hover:bg-accent hover:text-foreground"
        >
          <GitBranch
            className="size-3 shrink-0"
            strokeWidth={1.75}
          />
          <span className="min-w-0 truncate">{displayName ?? name}</span>
          <ArrowUpRight
            className="size-3 shrink-0"
            strokeWidth={1.75}
          />
        </a>
        <CopyButton value={name} copyLabel={m.git_copy_branch_name_label()} />
      </span>
    )
  }
  return (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md bg-muted pr-1 font-mono text-xs text-muted-foreground transition-colors duration-100 hover:text-foreground"
      title={name}
    >
      <a
        href={`https://github.com/${slug}/tree/${name}`}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex min-w-0 items-center gap-1 rounded-md py-0.5 pl-1.5 transition-colors duration-100 hover:text-foreground"
      >
        <GitBranch className="size-3 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 truncate">{displayName ?? name}</span>
        <ArrowUpRight className="size-3 shrink-0" strokeWidth={1.75} />
      </a>
      <CopyButton value={name} copyLabel={m.git_copy_branch_name_label()} />
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
    <Badge
      render={
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        />
      }
      tone={badgeTone}
      size="xs"
    >
      <Icon strokeWidth={1.75} />#{number}
      {checks && checks !== "none" && (
        <Circle
          className={cn("size-2 fill-current", checksColor(checks))}
          strokeWidth={0}
        />
      )}
      {tone === "draft" && <span>{m.git_pr_draft_label()}</span>}
    </Badge>
  )
}
