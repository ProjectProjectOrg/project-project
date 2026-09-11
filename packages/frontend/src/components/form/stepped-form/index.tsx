import type { AnyReactFormApi, StandardSchemaV1 } from "@tanstack/react-form"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"

export type SteppedFormStep = {
  id: string
  heading: ReactNode
  summary: ReactNode
  validator?: StandardSchemaV1
  children: ReactNode
}

export type SteppedFormLabels = {
  change: ReactNode
  next: ReactNode
  submit: ReactNode
}

export function SteppedForm({
  form,
  steps,
  step,
  onStepChange,
  labels,
  busy = false
}: {
  form: AnyReactFormApi
  steps: ReadonlyArray<SteppedFormStep>
  step: string
  onStepChange: (id: string) => void
  labels: SteppedFormLabels
  busy?: boolean
}) {
  const activeIndex = steps.findIndex((entry) => entry.id === step)
  const nextStep = steps[activeIndex + 1]

  return (
    <fieldset disabled={busy} className="flex flex-col gap-2">
      {steps.map((entry) =>
        entry.id === step ? (
          <div key={entry.id} className="flex flex-col gap-2">
            <span className="text-sm font-medium">{entry.heading}</span>
            <form.FormGroup
              name={entry.id}
              validators={
                entry.validator
                  ? [
                      {
                        run: entry.validator,
                        triggers: ["change"],
                        runOnMount: true
                      }
                    ]
                  : []
              }
            >
              {(group) => (
                <>
                  {entry.children}
                  {nextStep ? (
                    <group.Subscribe
                      selector={(state) => state.isValid && !state.isValidating}
                    >
                      {(canAdvance) => (
                        <Button
                          size="sm"
                          disabled={!canAdvance}
                          onClick={() => onStepChange(nextStep.id)}
                        >
                          {labels.next}
                        </Button>
                      )}
                    </group.Subscribe>
                  ) : null}
                </>
              )}
            </form.FormGroup>
          </div>
        ) : (
          <div key={entry.id} className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {entry.summary}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onStepChange(entry.id)}
            >
              {labels.change}
            </Button>
          </div>
        )
      )}
    </fieldset>
  )
}
