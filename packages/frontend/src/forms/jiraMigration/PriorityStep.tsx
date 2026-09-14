import type {
  JiraMigrationRequirements,
  TicketPriority
} from "@projectproject/shared"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select"
import { m } from "@/paraglide/messages"
import type { JiraMigrationForm } from "./opts"
import { StepFrame } from "./StepFrame"

const priorityOptions: ReadonlyArray<{
  value: TicketPriority
  label: () => string
}> = [
  { value: "high", label: m.jira_migration_priority_high },
  { value: "med", label: m.jira_migration_priority_medium },
  { value: "low", label: m.jira_migration_priority_low }
]

export function PriorityStep({
  form,
  requirements,
  waiting,
  error,
  onBack,
  onNext
}: StepProps) {
  return (
    <StepFrame
      title={m.jira_migration_priorities_title()}
      description={m.jira_migration_priorities_description()}
      waiting={waiting}
      error={error}
      onBack={onBack}
      onNext={onNext}
    >
      <div className="divide-y divide-border">
        {requirements.priorities.map((priority, index) => (
          <div
            key={priority.jiraPriorityId}
            className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-sm font-medium">{priority.name}</span>
            <form.Field name={`priorities[${index}].projectPriority`}>
              {(field) => (
                <Select
                  value={field.value ?? ""}
                  onValueChange={(value) => {
                    const option = priorityOptions.find(
                      (candidate) => candidate.value === value
                    )
                    if (option) field.handleChange(option.value)
                  }}
                >
                  <SelectTrigger
                    aria-label={priority.name}
                    placeholder={m.jira_migration_priorities_title()}
                    className="w-full sm:w-64"
                  />
                  <SelectContent>
                    {priorityOptions.map((option, optionIndex) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        index={optionIndex}
                      >
                        {option.label()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </form.Field>
          </div>
        ))}
      </div>
    </StepFrame>
  )
}

interface StepProps {
  form: JiraMigrationForm
  requirements: JiraMigrationRequirements
  waiting: boolean
  error: string | null
  onBack: () => void
  onNext: () => void
}
