import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  GIT_AUTOMATION_EVENTS,
  type GitAutomation,
  type GitAutomationEvent,
  type ProjectStatus,
  type StatusSlug
} from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import {
  GitBranch,
  GitBranchMinus,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  type LucideIcon,
  Minus
} from "lucide-react"

import { ErrorPage } from "@/components/shell/ErrorPage"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import { SettingsSwitch } from "@/components/shell/settings/SettingsTextField"
import { Select, SelectTrigger } from "@/components/ui/select"
import {
  gitAutomationFor,
  gitAutomationRequest,
  updateGitAutomation
} from "@/features/projects/atoms/gitAutomation"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
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
    <SettingsSection
      title={m.git_automation_heading()}
      description={m.git_automation_description()}
    >
      {AsyncResult.matchWithError(AsyncResult.all([automation, statuses]), {
        onInitial: () => (
          <SettingsSkeleton rows={GIT_AUTOMATION_EVENTS.length} />
        ),
        onError: (error) => <ErrorPage error={error} contained />,
        onDefect: (defect) => <ErrorPage error={defect} contained />,
        onSuccess: ({ value: [current, statusList] }) => (
          <Rules
            orgSlug={orgSlug}
            slug={slug}
            canEdit={canEdit}
            automation={current}
            statuses={statusList}
          />
        )
      })}
    </SettingsSection>
  )
}

function Rules({
  orgSlug,
  slug,
  canEdit,
  automation,
  statuses
}: Props &
  Readonly<{
    automation: GitAutomation
    statuses: ReadonlyArray<ProjectStatus>
  }>) {
  const mutation = updateGitAutomation(gitAutomationRequest(orgSlug, slug))
  const save = useAtomSet(mutation)
  const failed = AsyncResult.isFailure(useAtomValue(mutation))

  return (
    <>
      <SettingsGroup>
        {GIT_AUTOMATION_EVENTS.map((event) => (
          <RuleRow
            key={event}
            event={event}
            target={automation.rules[event]}
            statuses={statuses}
            disabled={!canEdit}
            onChange={(target) => save({ rules: { [event]: target } })}
          />
        ))}
        <SettingsRow
          label={m.git_automation_forward_only_label()}
          description={m.git_automation_forward_only_description()}
        >
          <SettingsSwitch
            checked={automation.forwardOnly}
            disabled={!canEdit}
            onCheckedChange={(forwardOnly) => save({ forwardOnly })}
          />
        </SettingsRow>
      </SettingsGroup>
      {failed ? (
        <p role="alert" className="px-0.5 text-xs text-destructive">
          {m.git_automation_save_error()}
        </p>
      ) : null}
    </>
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
    <SettingsRow
      label={meta.label()}
      description={meta.hint()}
      icon={
        <EventIcon
          className="size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
        />
      }
    >
      <Select
        value={target ?? DONT_MOVE}
        disabled={disabled}
        onValueChange={(value) => {
          const next =
            statuses.find((status) => status.slug === value)?.slug ?? null
          if (next !== target) onChange(next)
        }}
        items={[
          {
            separated: statuses.length > 0,
            value: DONT_MOVE,
            textValue: m.git_automation_dont_move(),
            label: <DontMoveOption />
          },
          ...statuses.map((status) => ({
            value: status.slug,
            textValue: status.label,
            label: <StatusOption slug={status.slug} statuses={statuses} />
          }))
        ]}
        contentProps={{ align: "end", className: "w-48" }}
      >
        <SelectTrigger
          aria-label={meta.label()}
          className="w-44"
          selectedLabel={
            target === null ? (
              <DontMoveOption />
            ) : (
              <StatusOption slug={target} statuses={statuses} />
            )
          }
        />
      </Select>
    </SettingsRow>
  )
}

function DontMoveOption() {
  return (
    <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
      <Minus className="size-4 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{m.git_automation_dont_move()}</span>
    </span>
  )
}

function StatusOption({
  slug,
  statuses
}: Readonly<{ slug: string; statuses: ReadonlyArray<ProjectStatus> }>) {
  const meta = statusMetaFor(slug, statuses)
  const Icon = meta.icon
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon
        className={cn("size-4 shrink-0", meta.className)}
        style={meta.color ? { color: meta.color } : undefined}
        strokeWidth={1.75}
      />
      <span className="truncate">{meta.label}</span>
    </span>
  )
}
