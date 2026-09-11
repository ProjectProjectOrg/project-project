import type { AnyReactFormApi, StandardSchemaV1 } from "@tanstack/react-form"
import { useRef, type ReactNode } from "react"
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
  const leftWith = useRef<Record<string, unknown>>({})

  const advance = (from: SteppedFormStep, to: SteppedFormStep) => {
    const value: unknown = form.state.values[from.id]
    const changed =
      !(from.id in leftWith.current) || leftWith.current[from.id] !== value
    leftWith.current[from.id] = value
    if (changed) {
      steps
        .slice(steps.indexOf(from) + 1)
        .forEach((later) => form.resetField(later.id))
    }
    onStepChange(to.id)
  }

  return (
    <fieldset disabled={busy} className="flex flex-col gap-2">
      {steps.map((entry) => (
        <form.FormGroup
          key={entry.id}
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
          {(group) =>
            entry.id === step ? (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">{entry.heading}</span>
                {entry.children}
                {nextStep ? (
                  <group.Subscribe
                    selector={(state) => state.isValid && !state.isValidating}
                  >
                    {(canAdvance) => (
                      <Button
                        size="sm"
                        disabled={!canAdvance}
                        onClick={() => advance(entry, nextStep)}
                      >
                        {labels.next}
                      </Button>
                    )}
                  </group.Subscribe>
                ) : (
                  <form.Subscribe
                    selector={(state) => state.canSubmit && !state.isValidating}
                  >
                    {(canSubmit) => (
                      <Button
                        size="sm"
                        disabled={!canSubmit}
                        onClick={() => void form.handleSubmit()}
                      >
                        {labels.submit}
                      </Button>
                    )}
                  </form.Subscribe>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between">
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
          }
        </form.FormGroup>
      ))}
    </fieldset>
  )
}
