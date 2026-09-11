import type { StandardSchemaV1 } from "@standard-schema/spec"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { useStore } from "@tanstack/react-form"
import { useFormContext } from "@/lib/form-context"

export type SteppedFormStep = {
  id: string
  heading: ReactNode
  summary: ReactNode
  validator?: StandardSchemaV1
  children: ReactNode
}

const isSatisfied = (schema: StandardSchemaV1, value: unknown) => {
  const result = schema["~standard"].validate(value)
  return result instanceof Promise ? false : !result.issues?.length
}

export type SteppedFormLabels = {
  change: ReactNode
  next: ReactNode
  submit: ReactNode
}

export function SteppedForm({
  steps,
  step,
  onStepChange,
  labels,
  busy = false
}: {
  steps: ReadonlyArray<SteppedFormStep>
  step: string
  onStepChange: (id: string) => void
  labels: SteppedFormLabels
  busy?: boolean
}) {
  const form = useFormContext()
  const values = useStore(form.store, (state) => state.values) as Record<
    string,
    unknown
  >
  const activeIndex = steps.findIndex((entry) => entry.id === step)
  const nextStep = steps[activeIndex + 1]

  return (
    <fieldset disabled={busy} className="flex flex-col gap-2">
      {steps.map((entry) =>
        entry.id === step ? (
          <div key={entry.id} className="flex flex-col gap-2">
            <span className="text-sm font-medium">{entry.heading}</span>
            {entry.children}
            {nextStep ? (
              <Button
                size="sm"
                disabled={
                  entry.validator
                    ? !isSatisfied(entry.validator, values[entry.id])
                    : false
                }
                onClick={() => onStepChange(nextStep.id)}
              >
                {labels.next}
              </Button>
            ) : null}
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
