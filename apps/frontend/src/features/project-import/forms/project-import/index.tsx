import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ProjectImport } from "@pp/shared"
import { ConfirmButton } from "@pp/ui/confirm-button"
import { useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import { useState } from "react"

import {
  cancelProjectImport,
  projectImportRequest,
  runProjectImport
} from "@/features/project-import/atoms/projectImport"
import { ProjectImportShell } from "@/features/project-import/components/ProjectImportShell"
import { ProjectImportTerminalStep } from "@/features/project-import/components/ProjectImportTerminalStep"
import { projectImportErrorMessage } from "@/features/project-import/lib/presentation"
import {
  projectImportStageForStatus,
  type ProjectImportStage
} from "@/features/project-import/lib/stages"
import { describeCause } from "@/lib/errorMessage"
import { useAppForm, validateAfterSubmit } from "@/lib/form"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import { DestinationStep } from "./DestinationStep"
import {
  defaultProjectImportValues,
  destinationValidator,
  projectImportFormOpts,
  toRunProjectImportInput
} from "./opts"
import { PeopleStep } from "./PeopleStep"
import { ReviewStep } from "./ReviewStep"

const formSteps = [
  "people",
  "destination",
  "review"
] as const satisfies ReadonlyArray<ProjectImportStage>

type FormStep = (typeof formSteps)[number]

const navigableSteps = [
  "people",
  "destination"
] as const satisfies ReadonlyArray<FormStep>

export function ProjectImportWizard({
  orgSlug,
  imported,
  source
}: Readonly<{
  orgSlug: string
  imported: ProjectImport
  source: NonNullable<ProjectImport["source"]>
}>) {
  const req = projectImportRequest(orgSlug, imported.id)
  const run = useAtomSet(runProjectImport(req), { mode: "promiseExit" })
  const runState = useAtomValue(runProjectImport(req))
  const [step, setStep] = useState<FormStep>("people")
  const [furthestStep, setFurthestStep] = useState<FormStep>("people")
  const [retrying, setRetrying] = useState(false)
  const form = useAppForm({
    ...projectImportFormOpts,
    defaultValues: defaultProjectImportValues(imported),
    onSubmit: async ({ value }) => {
      const exit = await run(toRunProjectImportInput(value))
      if (Exit.isSuccess(exit)) setRetrying(false)
    }
  })
  const waiting = runState.waiting
  const runError = mutationErrorText(
    runState,
    projectImportErrorMessage,
    m.project_import_run_error
  )
  if (retrying && imported.status !== "failed") setRetrying(false)

  const goTo = (next: FormStep) => {
    if (formSteps.indexOf(next) > formSteps.indexOf(furthestStep)) {
      setFurthestStep(next)
    }
    setStep(next)
  }

  if (imported.status === "ready" || retrying) {
    return (
      <ProjectImportShell
        orgSlug={orgSlug}
        stage={step}
        furthestStage={furthestStep}
        navigation={{ stages: navigableSteps, onNavigate: setStep }}
        action={
          <CancelImportButton
            orgSlug={orgSlug}
            importId={imported.id}
            disabled={waiting}
          />
        }
      >
        {step === "people" ? (
          <form.FormGroup
            key="people"
            name="people"
            onSubmit={() => goTo("destination")}
          >
            {(group) => (
              <PeopleStep
                form={form}
                orgSlug={orgSlug}
                people={imported.people}
                waiting={waiting}
                onNext={() => void group.handleSubmit()}
              />
            )}
          </form.FormGroup>
        ) : null}
        {step === "destination" ? (
          <form.FormGroup
            key="destination"
            name="destination"
            validators={[validateAfterSubmit(destinationValidator)]}
            onSubmit={() => goTo("review")}
          >
            {(group) => (
              <DestinationStep
                form={form}
                sourceName={source.name}
                waiting={waiting}
                onBack={() => setStep("people")}
                onNext={() => void group.handleSubmit()}
              />
            )}
          </form.FormGroup>
        ) : null}
        {step === "review" ? (
          <ReviewStep
            form={form}
            imported={imported}
            sourceKey={source.key}
            waiting={waiting}
            error={runError}
            onBack={() => setStep("destination")}
            onNext={() => void form.handleSubmit()}
          />
        ) : null}
      </ProjectImportShell>
    )
  }

  return (
    <ProjectImportShell
      orgSlug={orgSlug}
      stage={projectImportStageForStatus(imported.status)}
      action={
        imported.status === "failed" ? (
          <CancelImportButton orgSlug={orgSlug} importId={imported.id} />
        ) : undefined
      }
    >
      <ProjectImportTerminalStep
        orgSlug={orgSlug}
        imported={imported}
        onRetry={() => {
          setRetrying(true)
          goTo("review")
        }}
      />
    </ProjectImportShell>
  )
}

function CancelImportButton({
  orgSlug,
  importId,
  disabled = false
}: Readonly<{ orgSlug: string; importId: string; disabled?: boolean }>) {
  const req = projectImportRequest(orgSlug, importId)
  const cancel = useAtomSet(cancelProjectImport(req), { mode: "promiseExit" })
  const cancelState = useAtomValue(cancelProjectImport(req))
  const navigate = useNavigate()

  const cancelAndLeave = async () => {
    const exit = await cancel()
    if (Exit.isSuccess(exit)) {
      await navigate({ to: "/orgs/$orgSlug/projects", params: { orgSlug } })
    }
    return exit
  }

  return (
    <ConfirmButton.Root>
      <ConfirmButton.Trigger variant="ghost" disabled={disabled}>
        {m.project_import_action_cancel()}
      </ConfirmButton.Trigger>
      <ConfirmButton.Confirm>
        <ConfirmButton.Action
          cancelLabel={m.common_cancel_button()}
          describeError={describeCause}
          prompt={m.project_import_cancel_prompt()}
          label={m.project_import_action_cancel_confirm()}
          waiting={cancelState.waiting}
          error={mutationErrorText(cancelState, projectImportErrorMessage)}
          onConfirm={cancelAndLeave}
        />
      </ConfirmButton.Confirm>
    </ConfirmButton.Root>
  )
}
