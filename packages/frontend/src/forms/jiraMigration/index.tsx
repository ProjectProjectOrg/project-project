import { useRef, useState } from "react"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import type { JiraMigrationDetail } from "@projectproject/shared"
import {
  configureJiraMigrationAtom,
  jiraMigrationKey,
  runJiraMigrationAtom
} from "@/atoms/jiraMigration"
import type { JiraMigrationStep } from "@/JiraMigration/JiraMigrationShell"
import { useAppForm } from "@/lib/form"
import { m } from "@/paraglide/messages"
import { DestinationStep } from "./DestinationStep"
import {
  buildJiraMigrationDraft,
  destinationValidator,
  issueTypesValidator,
  jiraMigrationFormOpts,
  peopleValidator,
  prioritiesValidator,
  statusesValidator,
  tagsValidator,
  toPartialJiraMigrationConfiguration,
  validateStep
} from "./opts"
import { PeopleStep } from "./PeopleStep"
import { PriorityStep } from "./PriorityStep"
import { ReviewStep } from "./ReviewStep"
import { StatusStep } from "./StatusStep"
import { TagsPlanningStep } from "./TagsPlanningStep"
import { TypeStep } from "./TypeStep"

const configurationSteps = [
  "people",
  "statuses",
  "types",
  "priorities",
  "planning",
  "destination",
  "review"
] as const satisfies ReadonlyArray<JiraMigrationStep>

export function JiraMigrationForm({
  orgSlug,
  detail,
  step,
  onStep
}: {
  orgSlug: string
  detail: JiraMigrationDetail
  step: (typeof configurationSteps)[number]
  onStep: (step: JiraMigrationStep) => void
}) {
  if (!detail.requirements || !detail.scanSummary) return null

  return (
    <ConfiguredJiraMigrationForm
      orgSlug={orgSlug}
      detail={detail}
      requirements={detail.requirements}
      summary={detail.scanSummary}
      step={step}
      onStep={onStep}
    />
  )
}

function ConfiguredJiraMigrationForm({
  orgSlug,
  detail,
  requirements,
  summary,
  step,
  onStep
}: {
  orgSlug: string
  detail: JiraMigrationDetail
  requirements: NonNullable<JiraMigrationDetail["requirements"]>
  summary: NonNullable<JiraMigrationDetail["scanSummary"]>
  step: (typeof configurationSteps)[number]
  onStep: (step: JiraMigrationStep) => void
}) {
  const key = jiraMigrationKey(orgSlug, detail.id)
  const revision = useRef(detail.revision)
  const [validationError, setValidationError] = useState<string | null>(null)
  const configure = useAtomSet(configureJiraMigrationAtom(key), {
    mode: "promiseExit"
  })
  const run = useAtomSet(runJiraMigrationAtom(key), { mode: "promiseExit" })
  const configureState = useAtomValue(configureJiraMigrationAtom(key))
  const runState = useAtomValue(runJiraMigrationAtom(key))
  const error = mutationError(configureState, runState) ?? validationError
  const waiting = configureState.waiting || runState.waiting

  const form = useAppForm({
    ...jiraMigrationFormOpts,
    defaultValues: buildJiraMigrationDraft(requirements, detail.configuration),
    onSubmit: async ({ value }) => {
      setValidationError(null)
      const configured = await configure({
        expectedRevision: revision.current,
        configuration: toPartialJiraMigrationConfiguration(value)
      })
      if (!Exit.isSuccess(configured)) return
      revision.current = configured.value.revision
      await run({ expectedRevision: configured.value.revision })
    },
    onSubmitInvalid: () => {
      setValidationError(m.jira_migration_mapping_required())
    }
  })

  const saveAndAdvance = async (next: JiraMigrationStep) => {
    setValidationError(null)
    const configured = await configure({
      expectedRevision: revision.current,
      configuration: toPartialJiraMigrationConfiguration(form.state.values)
    })
    if (Exit.isSuccess(configured)) {
      revision.current = configured.value.revision
      onStep(next)
    }
  }

  const previous = () => {
    const index = configurationSteps.indexOf(step)
    onStep(index === 0 ? "snapshot" : configurationSteps[index - 1])
  }

  const commonProps = {
    form,
    requirements,
    waiting,
    error,
    onBack: previous
  }

  switch (step) {
    case "people":
      return (
        <form.FormGroup
          name="identities"
          validators={[validateStep(peopleValidator)]}
          onSubmit={() => saveAndAdvance("statuses")}
          onSubmitInvalid={() =>
            setValidationError(m.jira_migration_mapping_required())
          }
        >
          {(group) => (
            <PeopleStep
              {...commonProps}
              onNext={() => void group.handleSubmit()}
            />
          )}
        </form.FormGroup>
      )
    case "statuses":
      return (
        <form.FormGroup
          name="statuses"
          validators={[validateStep(statusesValidator)]}
          onSubmit={() => saveAndAdvance("types")}
          onSubmitInvalid={() =>
            setValidationError(m.jira_migration_mapping_required())
          }
        >
          {(group) => (
            <StatusStep
              {...commonProps}
              onNext={() => void group.handleSubmit()}
            />
          )}
        </form.FormGroup>
      )
    case "types":
      return (
        <form.FormGroup
          name="issueTypes"
          validators={[validateStep(issueTypesValidator)]}
          onSubmit={() => saveAndAdvance("priorities")}
          onSubmitInvalid={() =>
            setValidationError(m.jira_migration_mapping_required())
          }
        >
          {(group) => (
            <TypeStep
              {...commonProps}
              onNext={() => void group.handleSubmit()}
            />
          )}
        </form.FormGroup>
      )
    case "priorities":
      return (
        <form.FormGroup
          name="priorities"
          validators={[validateStep(prioritiesValidator)]}
          onSubmit={() => saveAndAdvance("planning")}
          onSubmitInvalid={() =>
            setValidationError(m.jira_migration_mapping_required())
          }
        >
          {(group) => (
            <PriorityStep
              {...commonProps}
              onNext={() => void group.handleSubmit()}
            />
          )}
        </form.FormGroup>
      )
    case "planning":
      return (
        <form.FormGroup
          name="tags"
          validators={[validateStep(tagsValidator)]}
          onSubmit={() => saveAndAdvance("destination")}
          onSubmitInvalid={() =>
            setValidationError(m.jira_migration_mapping_required())
          }
        >
          {(group) => (
            <TagsPlanningStep
              {...commonProps}
              onNext={() => void group.handleSubmit()}
            />
          )}
        </form.FormGroup>
      )
    case "destination":
      return (
        <form.FormGroup
          name="destination"
          validators={[validateStep(destinationValidator)]}
          onSubmit={() => saveAndAdvance("review")}
          onSubmitInvalid={() =>
            setValidationError(m.jira_migration_destination_invalid())
          }
        >
          {(group) => (
            <DestinationStep
              form={form}
              waiting={waiting}
              error={error}
              onBack={previous}
              onNext={() => void group.handleSubmit()}
            />
          )}
        </form.FormGroup>
      )
    case "review":
      return (
        <form.FormGroup
          name="restrictedContent"
          onSubmit={async () => {
            await form.handleSubmit()
          }}
          onSubmitInvalid={() =>
            setValidationError(m.jira_migration_mapping_required())
          }
        >
          {(group) => (
            <ReviewStep
              {...commonProps}
              summary={summary}
              onNext={() => void group.handleSubmit()}
            />
          )}
        </form.FormGroup>
      )
  }
  step satisfies never
  throw new Error("Unreachable Jira migration step")
}

function mutationError(
  configure: Result.AsyncResult<unknown, unknown>,
  run: Result.AsyncResult<unknown, unknown>
): string | null {
  return Result.isFailure(configure) || Result.isFailure(run)
    ? m.jira_migration_error_generic()
    : null
}
