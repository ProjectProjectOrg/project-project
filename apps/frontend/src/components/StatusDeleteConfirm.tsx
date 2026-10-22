import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ProjectStatus, StatusSlug } from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { ChevronDown, Trash2 } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import { Button } from "@/components/ui/button"
import { ConfirmButton, useConfirmButton } from "@/components/ui/confirm-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
import {
  countsRequest,
  ticketCounts
} from "@/features/tickets/atoms/ticketCounts"
import { useProjectActor } from "@/lib/access"
import { statusLabelFor, statusMetaFor } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Props = Readonly<{
  status: ProjectStatus
  statuses: ReadonlyArray<ProjectStatus>
  orgSlug: string
  slug: string
}>

export function StatusDeleteConfirm({
  status,
  statuses,
  orgSlug,
  slug
}: Props) {
  return (
    <ConfirmButton.Root>
      <ConfirmButton.Trigger
        variant="ghost"
        size="icon-sm"
        aria-label={m.tickets_status_delete_button()}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 strokeWidth={1.75} />
      </ConfirmButton.Trigger>
      <ConfirmButton.Confirm>
        <ConfirmBody
          status={status}
          statuses={statuses}
          orgSlug={orgSlug}
          slug={slug}
        />
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
  const atom = gitAutomationFor(gitAutomationRequest(props.orgSlug, props.slug))
  const automation = useAtomValue(atom)
  const refresh = useAtomRefresh(atom)
  return (
    <DeleteStatusForm {...props} automationReady={Result.isSuccess(automation)}>
      {Result.matchWithError(automation, {
        onInitial: () => (
          <output className="text-xs text-muted-foreground">
            {m.tickets_status_loading()}
          </output>
        ),
        onError: (error) => (
          <ErrorPage error={error} reset={refresh} contained />
        ),
        onDefect: (defect) => (
          <ErrorPage error={defect} reset={refresh} contained />
        ),
        onSuccess: ({ value }) =>
          Object.values(value.rules).includes(props.status.slug) ? (
            <span className="inline-flex h-8 items-center text-xs text-muted-foreground">
              {m.tickets_status_delete_resets_git_automation()}
            </span>
          ) : null
      })}
    </DeleteStatusForm>
  )
}

function DeleteStatusForm({
  status,
  statuses,
  orgSlug,
  slug,
  automationReady,
  children
}: Props & Readonly<{ automationReady: boolean; children?: ReactNode }>) {
  const { close, busy, setBusy } = useConfirmButton()
  const req = useMemo(() => statusesRequest(orgSlug, slug), [orgSlug, slug])
  const remove = useAtomSet(deleteStatus({ req, statusSlug: status.slug }), {
    mode: "promiseExit"
  })

  const countResult = useAtomValue(
    ticketCounts(countsRequest(orgSlug, slug, {}))
  )
  const affectedCount = Result.isSuccess(countResult)
    ? (countResult.value.byStatus[status.slug] ?? 0)
    : 0

  const targets = statuses.filter((s) => s.slug !== status.slug)
  const [target, setTarget] = useState<string>("")
  const effectiveTarget = target || targets[0]?.slug || ""
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    const exit = await remove({
      reassignTo:
        affectedCount > 0 ? (effectiveTarget as StatusSlug) : undefined
    })
    if (Exit.isSuccess(exit)) {
      close()
      return
    }
    setBusy(false)
    setError(m.tickets_status_delete_error_fallback())
  }

  const blocked =
    busy || !automationReady || (affectedCount > 0 && !effectiveTarget)

  return (
    <>
      <span className="inline-flex h-8 items-center text-xs text-muted-foreground">
        {affectedCount > 0
          ? m.tickets_status_delete_confirm_with_tickets({
              count: affectedCount
            })
          : m.tickets_status_delete_confirm_empty()}
      </span>
      {children}
      {affectedCount > 0 ? (
        <TargetPicker
          targets={targets}
          statuses={statuses}
          value={effectiveTarget}
          onChange={setTarget}
        />
      ) : null}
      <Button
        size="sm"
        onClick={() => {
          void run()
        }}
        disabled={blocked}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        {busy ? m.tickets_status_deleting() : m.tickets_status_delete_button()}
      </Button>
      <ConfirmButton.Cancel />
      {error !== null ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </>
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
  value: string
  onChange: (slug: string) => void
}) {
  const selectedMeta = statusMetaFor(value, statuses)
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
            <span>{statusLabelFor(value, statuses)}</span>
            <ChevronDown className="ml-1 size-3.5 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" sideOffset={6} className="w-44">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next: string) => onChange(next as typeof value)}
        >
          {targets.map((s) => {
            const meta = statusMetaFor(s.slug, statuses)
            const Icon = meta.icon
            return (
              <DropdownMenuRadioItem key={s.slug} value={s.slug} closeOnClick>
                <Icon
                  className={cn("size-4", meta.className)}
                  style={meta.color ? { color: meta.color } : undefined}
                  strokeWidth={1.75}
                />
                {meta.label}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
