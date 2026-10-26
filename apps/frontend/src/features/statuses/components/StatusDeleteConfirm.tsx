import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ProjectStatus } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { ChevronDown } from "lucide-react"
import { useState, type ReactNode } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  gitAutomationFor,
  gitAutomationRequest
} from "@/features/projects/atoms/gitAutomation"
import {
  deleteStatus,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  countsRequest,
  ticketCounts
} from "@/features/tickets/atoms/ticketCounts"
import {
  statusLabelFor,
  statusMetaFor
} from "@/features/tickets/lib/ticketMeta"
import { useProjectActor } from "@/lib/access"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Props = Readonly<{
  status: ProjectStatus
  statuses: ReadonlyArray<ProjectStatus>
}>

export function StatusDeleteConfirm({ status, statuses }: Props) {
  return (
    <ConfirmButton.Root>
      <ConfirmButton.DeleteTrigger
        aria-label={m.tickets_status_delete_button()}
      />
      <ConfirmButton.Confirm>
        <ConfirmBody status={status} statuses={statuses} />
      </ConfirmButton.Confirm>
    </ConfirmButton.Root>
  )
}

function ConfirmBody(props: Props) {
  const canReadGitAutomation = useProjectActor().call("gitAutomation", "get")
  return canReadGitAutomation ? (
    <AutomationConfirmBody {...props} />
  ) : (
    <DeleteStatusForm {...props} automationReady />
  )
}

function AutomationConfirmBody(props: Props) {
  const { orgSlug, slug } = useProjectRoute()
  const atom = gitAutomationFor(gitAutomationRequest(orgSlug, slug))
  const automation = useAtomValue(atom)
  const refresh = useAtomRefresh(atom)
  return (
    <DeleteStatusForm {...props} automationReady={Result.isSuccess(automation)}>
      <AsyncView
        result={automation}
        contained
        reset={refresh}
        onInitial={() => (
          <output className="text-xs text-muted-foreground">
            {m.tickets_status_loading()}
          </output>
        )}
        onSuccess={({ value }) =>
          Object.values(value.rules).includes(props.status.slug) ? (
            <span className="inline-flex h-8 items-center text-xs text-muted-foreground">
              {m.tickets_status_delete_resets_git_automation()}
            </span>
          ) : null
        }
      />
    </DeleteStatusForm>
  )
}

function DeleteStatusForm({
  status,
  statuses,

  automationReady,
  children
}: Props & Readonly<{ automationReady: boolean; children?: ReactNode }>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = statusesRequest(orgSlug, slug)
  const mutation = deleteStatus({ req, statusSlug: status.slug })
  const remove = useAtomSet(mutation, { mode: "promiseExit" })
  const removeState = useAtomValue(mutation)

  const countResult = useAtomValue(
    ticketCounts(countsRequest(orgSlug, slug, {}))
  )
  const affectedCount = Result.isSuccess(countResult)
    ? (countResult.value.byStatus[status.slug] ?? 0)
    : 0

  const targets = statuses.filter((s) => s.slug !== status.slug)
  const [target, setTarget] = useState<ProjectStatus["slug"] | null>(null)
  const effectiveTarget =
    targets.find((status) => status.slug === target)?.slug ?? targets[0]?.slug

  return (
    <ConfirmButton.Action
      prompt={
        affectedCount > 0
          ? m.tickets_status_delete_confirm_with_tickets({
              count: affectedCount
            })
          : m.tickets_status_delete_confirm_empty()
      }
      label={m.tickets_status_delete_button()}
      busyLabel={m.tickets_status_deleting()}
      waiting={removeState.waiting}
      describeError={() => m.tickets_status_delete_error_fallback()}
      disabled={!automationReady || (affectedCount > 0 && !effectiveTarget)}
      onConfirm={() =>
        remove({ reassignTo: affectedCount > 0 ? effectiveTarget : undefined })
      }
    >
      {children}
      {affectedCount > 0 ? (
        <TargetPicker
          targets={targets}
          statuses={statuses}
          value={effectiveTarget ?? null}
          onChange={setTarget}
        />
      ) : null}
    </ConfirmButton.Action>
  )
}

function TargetPicker({
  targets,
  statuses,
  value,
  onChange
}: {
  targets: ReadonlyArray<ProjectStatus>
  statuses: ReadonlyArray<ProjectStatus>
  value: ProjectStatus["slug"] | null
  onChange: (slug: ProjectStatus["slug"]) => void
}) {
  const selectedMeta = statusMetaFor(value ?? "", statuses)
  const SelectedIcon = selectedMeta.icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="tertiary" size="sm">
            <SelectedIcon
              className={cn("size-3.5", selectedMeta.className)}
              style={
                selectedMeta.color ? { color: selectedMeta.color } : undefined
              }
              strokeWidth={1.75}
            />
            <span>{statusLabelFor(value ?? "", statuses)}</span>
            <ChevronDown className="ml-1 size-3.5 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" sideOffset={6} className="w-44">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={onChange}
          items={targets.map((s) => {
            const meta = statusMetaFor(s.slug, statuses)
            const Icon = meta.icon
            return {
              value: s.slug,
              closeOnClick: true,
              label: (
                <>
                  <Icon
                    className={cn("size-4", meta.className)}
                    style={meta.color ? { color: meta.color } : undefined}
                    strokeWidth={1.75}
                  />
                  {meta.label}
                </>
              )
            }
          })}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
