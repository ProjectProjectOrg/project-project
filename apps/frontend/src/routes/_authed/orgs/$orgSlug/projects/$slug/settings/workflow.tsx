import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { ProjectPolicy } from "@pp/access/policies"
import { EstimationMode } from "@pp/shared"
import { createFileRoute } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Exit from "effect/Exit"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useState } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import {
  SEGMENTED_ITEM_CLASS,
  SegmentedTabs,
  type SegmentedItem
} from "@/components/SegmentedTabs"
import { StatusList } from "@/components/StatusList"
import { Button } from "@/components/ui/button"
import { ConfirmButton, useConfirmButton } from "@/components/ui/confirm-button"
import {
  projectRequest,
  updateProject,
  updateProjectSetup,
  type ProjectRequest
} from "@/features/projects/atoms/projects"
import {
  clearStaleEstimates,
  staleEstimateCount
} from "@/features/tickets/atoms/staleEstimates"
import { useProjectActor } from "@/lib/access"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

import { useProject } from "../-context"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/workflow"
)({
  component: WorkflowSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.project_settings_workflow_tab() }
  })
})

function WorkflowSettings() {
  const { orgSlug } = Route.useParams()
  const project = useProject()
  const req = projectRequest(orgSlug, project.slug)
  const update = useAtomSet(updateProjectSetup(req))
  const updateState = useAtomValue(updateProjectSetup(req))
  const canEdit = useProjectActor().call("statuses", "create")
  const reviewedAt = project.setup.workflowReviewedAt

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3">
        <div>
          <p className="text-sm font-medium">
            {m.project_settings_workflow_review_label()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {reviewedAt
              ? m.project_settings_workflow_reviewed_at({
                  when: new Intl.DateTimeFormat(getLocale(), {
                    dateStyle: "medium",
                    timeStyle: "short"
                  }).format(reviewedAt)
                })
              : m.project_settings_workflow_not_reviewed()}
          </p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            variant="secondary"
            disabled={updateState.waiting}
            onClick={() =>
              update({
                workflowReviewedAt: reviewedAt
                  ? null
                  : DateTime.toDate(DateTime.nowUnsafe())
              })
            }
          >
            {reviewedAt
              ? m.project_settings_workflow_mark_unreviewed()
              : m.project_settings_workflow_mark_reviewed()}
          </Button>
        ) : null}
      </div>

      <EstimationSettings req={req} estimation={project.estimation} />

      <div className="flex w-full flex-col gap-3">
        <div>
          <p className="text-sm font-medium">
            {m.project_settings_workflow_statuses_label()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {m.project_settings_workflow_statuses_description()}
          </p>
        </div>
        <StatusList orgSlug={orgSlug} slug={project.slug} />
      </div>
    </div>
  )
}

const ESTIMATION_MODE_LABELS: Readonly<Record<EstimationMode, () => string>> = {
  off: () => m.project_settings_estimation_mode_off(),
  points: () => m.project_settings_estimation_mode_points(),
  tshirt: () => m.project_settings_estimation_mode_tshirt(),
  time: () => m.project_settings_estimation_mode_time()
}

const estimationItems = (): ReadonlyArray<SegmentedItem<EstimationMode>> =>
  EstimationMode.literals.map((key) => ({
    key,
    label: ESTIMATION_MODE_LABELS[key]()
  }))

function EstimationSettings({
  req,
  estimation
}: Readonly<{ req: ProjectRequest; estimation: EstimationMode }>) {
  const canEdit = ProjectPolicy.canUpdate(useProjectActor(), {
    settings: true
  })
  const update = useAtomSet(updateProject(req))
  const updateState = useAtomValue(updateProject(req))

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {m.project_settings_estimation_label()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {m.project_settings_estimation_description()}
          </p>
        </div>
        {canEdit ? (
          <SegmentedTabs
            items={estimationItems()}
            isActive={(key) => key === estimation}
            className={cn(updateState.waiting && "animate-pulse")}
            renderItem={(item, content, { active }) => (
              <button
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (!active) update({ estimation: item.key })
                }}
                className={SEGMENTED_ITEM_CLASS(active)}
              >
                {content}
              </button>
            )}
          />
        ) : (
          <span className="text-sm text-muted-foreground">
            {ESTIMATION_MODE_LABELS[estimation]()}
          </span>
        )}
      </div>
      {Result.matchWithError(updateState, {
        onInitial: () => null,
        onSuccess: () => null,
        onError: (error) => <ErrorPage error={error} contained />,
        onDefect: (defect) => <ErrorPage error={defect} contained />
      })}
      {canEdit && <StaleEstimates req={req} />}
    </div>
  )
}

function StaleEstimates({ req }: Readonly<{ req: ProjectRequest }>) {
  const count = useAtomValue(staleEstimateCount(req))
  const stale = Result.isSuccess(count) ? count.value.total : 0
  if (stale === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
      <p className="text-xs text-muted-foreground">
        {m.project_settings_estimation_stale({ count: stale })}
      </p>
      <ConfirmButton.Root>
        <ConfirmButton.Trigger variant="secondary" size="sm">
          {m.project_settings_estimation_clear_stale({ count: stale })}
        </ConfirmButton.Trigger>
        <ConfirmButton.Confirm>
          <ClearStaleConfirm req={req} />
        </ConfirmButton.Confirm>
      </ConfirmButton.Root>
    </div>
  )
}

function ClearStaleConfirm({ req }: Readonly<{ req: ProjectRequest }>) {
  const { close, busy, setBusy } = useConfirmButton()
  const clear = useAtomSet(clearStaleEstimates(req), { mode: "promiseExit" })
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    const exit = await clear()
    if (Exit.isSuccess(exit)) {
      close()
      return
    }
    setBusy(false)
    setError(m.error_unknown())
  }

  return (
    <>
      <span className="text-[13px] text-muted-foreground">
        {error ?? m.project_settings_estimation_clear_stale_confirm()}
      </span>
      <Button
        size="sm"
        variant="destructive"
        disabled={busy}
        onClick={() => void run()}
      >
        {m.project_settings_estimation_clear_stale_submit()}
      </Button>
      <ConfirmButton.Cancel>{m.common_cancel_button()}</ConfirmButton.Cancel>
    </>
  )
}
