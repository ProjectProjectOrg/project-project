import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { ProjectPolicy } from "@pp/access/policies"
import { EstimationMode } from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Result from "effect/reactivity/AsyncResult"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { SettingsRow } from "@/components/shell/settings/SettingsSection"
import { SettingsSegmented } from "@/components/shell/settings/SettingsTextField"
import { ConfirmButton } from "@/components/ui/confirm-button"
import { type SegmentedItem } from "@/components/ui/segmented-tabs"
import {
  updateProject,
  type ProjectRequest
} from "@/features/projects/atoms/projects"
import {
  clearStaleEstimates,
  staleEstimateCount,
  staleEstimateCountWaiting
} from "@/features/tickets/atoms/staleEstimates"
import { useProjectActor } from "@/lib/access"
import { errorMessage } from "@/lib/errorMessage"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

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

export function EstimationSettings({
  req,
  estimation
}: Readonly<{ req: ProjectRequest; estimation: EstimationMode }>) {
  const canEdit = ProjectPolicy.canUpdate(useProjectActor(), {
    settings: true
  })
  const update = useAtomSet(updateProject(req))
  const updateState = useAtomValue(updateProject(req))

  const error = Result.matchWithError(updateState, {
    onInitial: () => null,
    onSuccess: () => null,
    onError: (error) => errorMessage(error),
    onDefect: () => m.error_unknown()
  })

  return (
    <>
      <SettingsRow
        label={m.project_settings_estimation_label()}
        description={m.project_settings_estimation_description()}
        error={error}
      >
        {canEdit ? (
          <SettingsSegmented
            items={estimationItems()}
            value={estimation}
            waiting={updateState.waiting}
            onValueChange={(next) => update({ estimation: next })}
          />
        ) : (
          <span className="text-[13px] text-muted-foreground">
            {ESTIMATION_MODE_LABELS[estimation]()}
          </span>
        )}
      </SettingsRow>
      {canEdit && <StaleEstimates req={req} />}
    </>
  )
}

function StaleEstimates({ req }: Readonly<{ req: ProjectRequest }>) {
  const count = useAtomValue(staleEstimateCount(req))
  const reading = useAtomValue(staleEstimateCountWaiting(req))
  const updating = useAtomValue(updateProject(req)).waiting
  const disabled = reading || updating
  const refresh = useAtomRefresh(staleEstimateCount(req))
  const clear = useAtomSet(clearStaleEstimates(req), { mode: "promiseExit" })
  return Result.matchWithError(count, {
    onInitial: () => null,
    onError: (error) => (
      <div className="p-3">
        <ErrorPage error={error} reset={refresh} contained />
      </div>
    ),
    onDefect: (defect) => (
      <div className="p-3">
        <ErrorPage error={defect} reset={refresh} contained />
      </div>
    ),
    onSuccess: ({ value: stale, waiting }) => {
      if (stale === 0 && !waiting) return null
      return (
        <SettingsRow
          label={
            <span className={cn(waiting && "animate-pulse")}>
              {m.project_settings_estimation_stale({ count: stale })}
            </span>
          }
        >
          <ConfirmButton.Root>
            <ConfirmButton.Trigger
              variant="secondary"
              size="sm"
              disabled={waiting || disabled}
            >
              {m.project_settings_estimation_clear_stale({ count: stale })}
            </ConfirmButton.Trigger>
            <ConfirmButton.Confirm>
              <ConfirmButton.Action
                prompt={m.project_settings_estimation_clear_stale_confirm()}
                label={m.project_settings_estimation_clear_stale_submit()}
                disabled={disabled}
                onConfirm={clear}
                describeError={(cause) =>
                  Option.match(Cause.findErrorOption(cause), {
                    onNone: () => m.error_unknown(),
                    onSome: (error) =>
                      Match.value(error).pipe(
                        Match.tag(
                          "Forbidden",
                          "NotFound",
                          "Unauthorized",
                          errorMessage
                        ),
                        Match.orElse(() => m.error_unknown())
                      )
                  })
                }
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </SettingsRow>
      )
    }
  })
}
