import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  GIT_AUTOMATION_EVENTS,
  type GitAutomation,
  type GitAutomationEvent,
  type ProjectStatus,
  type StatusSlug
} from "@pp/shared"
import {
  GitBranch,
  GitBranchMinus,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  type IconType,
  Minus
} from "@pp/ui/icons"
import { Select, SelectTrigger } from "@pp/ui/select"
import type * as Exit from "effect/Exit"
import * as AsyncResult from "effect/reactivity/AsyncResult"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import { SettingsSwitch } from "@/components/shell/settings/SettingsTextField"
import {
  gitAutomationFor,
  gitAutomationRequest,
  updateGitAutomation
} from "@/features/projects/atoms/gitAutomation"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { StatusOption } from "@/features/statuses/components/StatusOption"
import { useSave } from "@/hooks/useSave"
import { m } from "@/paraglide/messages"

const DONT_MOVE = ""

const EVENTS: Readonly<
  Record<
    GitAutomationEvent,
    Readonly<{ icon: IconType; label: () => string; hint: () => string }>
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
  canEdit: boolean
}>

export function GitAutomationSettings({ canEdit }: Props) {
  const { orgSlug, slug } = useProjectRoute()
  const automation = useAtomValue(
    gitAutomationFor(gitAutomationRequest(orgSlug, slug))
  )
  const statuses = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))

  return (
    <SettingsSection
      title={m.git_automation_heading()}
      description={m.git_automation_description()}
    >
      <AsyncView
        result={AsyncResult.all([automation, statuses])}
        contained
        onInitial={() => (
          <SettingsSkeleton rows={GIT_AUTOMATION_EVENTS.length} />
        )}
        onSuccess={({ value: [current, statusList] }) => (
          <Rules canEdit={canEdit} automation={current} statuses={statusList} />
        )}
      />
    </SettingsSection>
  )
}

function Rules({
  canEdit,
  automation,
  statuses
}: Props &
  Readonly<{
    automation: GitAutomation
    statuses: ReadonlyArray<ProjectStatus>
  }>) {
  const { orgSlug, slug } = useProjectRoute()
  const update = useAtomSet(
    updateGitAutomation(gitAutomationRequest(orgSlug, slug)),
    { mode: "promiseExit" }
  )
  const forwardOnly = useSave((next: boolean) => update({ forwardOnly: next }))

  return (
    <SettingsGroup>
      {GIT_AUTOMATION_EVENTS.map((event) => (
        <RuleRow
          key={event}
          event={event}
          target={automation.rules[event]}
          statuses={statuses}
          canEdit={canEdit}
          onChange={(target) => update({ rules: { [event]: target } })}
        />
      ))}
      <SettingsRow
        label={m.git_automation_forward_only_label()}
        description={m.git_automation_forward_only_description()}
        error={forwardOnly.error ? m.git_automation_save_error() : null}
      >
        {canEdit ? (
          <SettingsSwitch
            checked={automation.forwardOnly}
            data-pending={forwardOnly.waiting || undefined}
            onCheckedChange={(next) => void forwardOnly.run(next)}
          />
        ) : (
          <span className="text-body text-muted-foreground">
            {automation.forwardOnly
              ? m.git_automation_forward_only_on()
              : m.git_automation_forward_only_off()}
          </span>
        )}
      </SettingsRow>
    </SettingsGroup>
  )
}

function RuleRow({
  event,
  target,
  statuses,
  canEdit,
  onChange
}: Readonly<{
  event: GitAutomationEvent
  target: StatusSlug | null
  statuses: ReadonlyArray<ProjectStatus>
  canEdit: boolean
  onChange: (target: StatusSlug | null) => Promise<Exit.Exit<unknown, unknown>>
}>) {
  const meta = EVENTS[event]
  const save = useSave(onChange)
  const current =
    target === null ? (
      <DontMoveOption />
    ) : (
      <StatusOption slug={target} statuses={statuses} />
    )
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
      error={save.error ? m.git_automation_save_error() : null}
    >
      {canEdit ? (
        <Select
          value={target ?? DONT_MOVE}
          onValueChange={(value) => {
            const next =
              statuses.find((status) => status.slug === value)?.slug ?? null
            if (next !== target) void save.run(next)
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
            data-pending={save.waiting || undefined}
            className="w-44"
            selectedLabel={current}
          />
        </Select>
      ) : (
        <span className="text-body">{current}</span>
      )}
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
