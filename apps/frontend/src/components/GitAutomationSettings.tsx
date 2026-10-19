import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  GIT_AUTOMATION_EVENTS,
  type GitAutomation,
  type GitAutomationEvent,
  type ProjectStatus,
  type StatusSlug
} from "@pp/shared"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import {
  GitBranch,
  GitBranchMinus,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  type LucideIcon
} from "lucide-react"
import { useId } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  gitAutomationFor,
  gitAutomationRequest,
  updateGitAutomation
} from "@/features/projects/atoms/gitAutomation"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { statusMetaFor } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const DONT_MOVE = ""

const EVENTS: Readonly<
  Record<
    GitAutomationEvent,
    Readonly<{ icon: LucideIcon; label: () => string; hint: () => string }>
  >
> = {
  branch_linked: {
    icon: GitBranch,
    label: m.git_automation_event_branch_linked,
    hint: m.git_automation_event_branch_linked_hint
  },
  pr_draft_opened: {
    icon: GitPullRequestDraft,
    label: m.git_automation_event_pr_draft_opened,
    hint: m.git_automation_event_pr_draft_opened_hint
  },
  pr_opened: {
    icon: GitPullRequest,
    label: m.git_automation_event_pr_opened,
    hint: m.git_automation_event_pr_opened_hint
  },
  pr_merged: {
    icon: GitMerge,
    label: m.git_automation_event_pr_merged,
    hint: m.git_automation_event_pr_merged_hint
  },
  pr_closed: {
    icon: GitPullRequestClosed,
    label: m.git_automation_event_pr_closed,
    hint: m.git_automation_event_pr_closed_hint
  },
  branch_deleted: {
    icon: GitBranchMinus,
    label: m.git_automation_event_branch_deleted,
    hint: m.git_automation_event_branch_deleted_hint
  }
}

type Props = Readonly<{
  orgSlug: string
  slug: string
  canEdit: boolean
}>

export function GitAutomationSettings({ orgSlug, slug, canEdit }: Props) {
  const automation = useAtomValue(
    gitAutomationFor(gitAutomationRequest(orgSlug, slug))
  )
  const statuses = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))

  return (
    <div className="flex w-full flex-col gap-3">
      <div>
        <p className="text-sm font-medium">{m.git_automation_heading()}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {m.git_automation_description()}
        </p>
      </div>
      {AsyncResult.matchWithError(AsyncResult.all([automation, statuses]), {
        onInitial: () => <RulesSkeleton />,
        onError: (error) => <ErrorPage error={error} contained />,
        onDefect: (defect) => <ErrorPage error={defect} contained />,
        onSuccess: ({ value: [current, statusList], waiting }) => (
          <Rules
            orgSlug={orgSlug}
            slug={slug}
            canEdit={canEdit}
            automation={current}
            statuses={statusList}
            waiting={waiting}
          />
        )
      })}
    </div>
  )
}

function Rules({
  orgSlug,
  slug,
  canEdit,
  automation,
  statuses,
  waiting
}: Props &
  Readonly<{
    automation: GitAutomation
    statuses: ReadonlyArray<ProjectStatus>
    waiting: boolean
  }>) {
  const mutation = updateGitAutomation(gitAutomationRequest(orgSlug, slug))
  const save = useAtomSet(mutation)
  const failed = AsyncResult.isFailure(useAtomValue(mutation))

  const forwardOnlyLabelId = useId()
  const forwardOnlyDescriptionId = useId()

  return (
    <div className="flex flex-col gap-6">
      <ul className={cn("flex flex-col gap-0.5", waiting && "animate-pulse")}>
        {GIT_AUTOMATION_EVENTS.map((event) => (
          <RuleRow
            key={event}
            event={event}
            target={automation.rules[event]}
            statuses={statuses}
            disabled={!canEdit || waiting}
            onChange={(target) => save({ rules: { [event]: target } })}
          />
        ))}
      </ul>
      <div className="flex items-start gap-3">
        <Switch
          checked={automation.forwardOnly}
          disabled={!canEdit || waiting}
          onCheckedChange={(forwardOnly) => save({ forwardOnly })}
          aria-labelledby={forwardOnlyLabelId}
          aria-describedby={forwardOnlyDescriptionId}
          className="mt-0.5"
        />
        <div>
          <p id={forwardOnlyLabelId} className="text-sm font-medium">
            {m.git_automation_forward_only_label()}
          </p>
          <p
            id={forwardOnlyDescriptionId}
            className="mt-1 text-xs text-muted-foreground"
          >
            {m.git_automation_forward_only_description()}
          </p>
        </div>
      </div>
      {failed ? (
        <p role="alert" className="text-xs text-destructive">
          {m.git_automation_save_error()}
        </p>
      ) : null}
    </div>
  )
}

function RuleRow({
  event,
  target,
  statuses,
  disabled,
  onChange
}: Readonly<{
  event: GitAutomationEvent
  target: StatusSlug | null
  statuses: ReadonlyArray<ProjectStatus>
  disabled: boolean
  onChange: (target: StatusSlug | null) => void
}>) {
  const meta = EVENTS[event]
  const EventIcon = meta.icon
  return (
    <li className="flex items-center gap-3 rounded-md px-1 py-1.5">
      <EventIcon
        className="size-4 shrink-0 text-muted-foreground"
        strokeWidth={1.75}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm">{meta.label()}</p>
        <p className="text-xs text-muted-foreground">{meta.hint()}</p>
      </div>
      <Select
        value={target ?? DONT_MOVE}
        disabled={disabled}
        onValueChange={(value) => {
          const next =
            statuses.find((status) => status.slug === value)?.slug ?? null
          if (next !== target) onChange(next)
        }}
      >
        <SelectTrigger
          aria-label={meta.label()}
          className="w-44"
          selectedLabel={
            target === null ? (
              <span className="text-muted-foreground">
                {m.git_automation_dont_move()}
              </span>
            ) : (
              <StatusOption slug={target} statuses={statuses} />
            )
          }
        />
        <SelectContent>
          <SelectItem
            value={DONT_MOVE}
            index={0}
            aria-label={m.git_automation_dont_move()}
          >
            <span className="text-muted-foreground">
              {m.git_automation_dont_move()}
            </span>
          </SelectItem>
          {statuses.map((status, index) => (
            <SelectItem
              key={status.slug}
              value={status.slug}
              index={index + 1}
              aria-label={status.label}
            >
              <StatusOption slug={status.slug} statuses={statuses} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </li>
  )
}

function StatusOption({
  slug,
  statuses
}: Readonly<{ slug: string; statuses: ReadonlyArray<ProjectStatus> }>) {
  const meta = statusMetaFor(slug, statuses)
  const Icon = meta.icon
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Icon
        className={cn("size-4 shrink-0", meta.className)}
        style={meta.color ? { color: meta.color } : undefined}
        strokeWidth={1.75}
      />
      <span className="truncate">{meta.label}</span>
    </span>
  )
}

function RulesSkeleton() {
  return (
    <ul className="flex flex-col gap-0.5">
      {GIT_AUTOMATION_EVENTS.map((event) => (
        <li key={event} className="h-12 animate-pulse rounded-md bg-muted/40" />
      ))}
    </ul>
  )
}
