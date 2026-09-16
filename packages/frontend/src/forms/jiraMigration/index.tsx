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
import {
  jiraMappingSteps,
  type JiraMigrationStep,
  type JiraWizardStep
} from "@/JiraMigration/JiraMigrationShell"
import { JiraSnapshotStep } from "@/JiraMigration/JiraSnapshotStep"
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
  restrictedContentValidator,
  statusesValidator,
  tagsValidator,
  toPartialJiraMigrationConfiguration,
  validateStep
} from "./opts"
import { PeopleStep } from "./PeopleStep"
import { PriorityStep } from "./PriorityStep"
import { ReadOnlySourceStep } from "./ReadOnlySourceStep"
import { ReviewStep } from "./ReviewStep"
import { StatusStep } from "./StatusStep"
import { TagsPlanningStep } from "./TagsPlanningStep"
import { TypeStep } from "./TypeStep"

const configurationSteps = [
  "people",
  ...jiraMappingSteps,
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
  step: JiraWizardStep
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
  step: JiraWizardStep
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

  const advance = (next: JiraMigrationStep) => {
    setValidationError(null)
    onStep(next)
  }

  const rejectIncompleteMapping = () =>
    setValidationError(m.jira_migration_mapping_required())

  const rejectMissingRestrictedContentPolicy = () =>
    setValidationError(m.jira_migration_restricted_required())

  const previous = () => {
    if (step === "connect" || step === "choose" || step === "snapshot") return
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
    case "connect":
      return (
        <ReadOnlySourceStep
          screen="connect"
          summary={summary}
          onBack={() => {}}
          onNext={() => advance("choose")}
        />
      )
    case "choose":
      return (
        <ReadOnlySourceStep
          screen="choose"
          summary={summary}
          onBack={() => onStep("connect")}
          onNext={() => advance("snapshot")}
        />
      )
    case "snapshot":
      return (
        <JiraSnapshotStep
          summary={summary}
          onBack={() => onStep("choose")}
          onContinue={() => advance("people")}
        />
      )
    case "people":
      return (
        <form.FormGroup
          key="identities"
          name="identities"
          validators={[validateStep(peopleValidator)]}
          onSubmit={() => advance("statuses")}
          onSubmitInvalid={rejectIncompleteMapping}
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
          key="statuses"
          name="statuses"
          validators={[validateStep(statusesValidator)]}
          onSubmit={() => advance("types")}
          onSubmitInvalid={rejectIncompleteMapping}
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
          key="issueTypes"
          name="issueTypes"
          validators={[validateStep(issueTypesValidator)]}
          onSubmit={() => advance("priorities")}
          onSubmitInvalid={rejectIncompleteMapping}
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
          key="priorities"
          name="priorities"
          validators={[validateStep(prioritiesValidator)]}
          onSubmit={() => advance("planning")}
          onSubmitInvalid={rejectIncompleteMapping}
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
          key="tags"
          name="tags"
          validators={[validateStep(tagsValidator)]}
          onSubmit={() => advance("destination")}
          onSubmitInvalid={rejectIncompleteMapping}
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
          key="destination"
          name="destination"
          validators={[validateStep(destinationValidator)]}
          onSubmit={() => advance("review")}
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
          key="restrictedContent"
          name="restrictedContent"
          validators={[validateStep(restrictedContentValidator)]}
          onSubmit={async () => {
            await form.handleSubmit()
          }}
          onSubmitInvalid={rejectMissingRestrictedContentPolicy}
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
