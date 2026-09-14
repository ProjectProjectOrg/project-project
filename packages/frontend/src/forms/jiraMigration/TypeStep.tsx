import type {
  JiraMigrationRequirements,
  TicketType
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

const typeOptions: ReadonlyArray<{
  value: TicketType
  label: () => string
}> = [
  { value: "feat", label: m.jira_migration_type_feature },
  { value: "bug", label: m.jira_migration_type_bug },
  { value: "chore", label: m.jira_migration_type_chore },
  { value: "other", label: m.jira_migration_type_other }
]

export function TypeStep({
  form,
  requirements,
  waiting,
  error,
  onBack,
  onNext
}: StepProps) {
  return (
    <StepFrame
      title={m.jira_migration_type_title()}
      description={m.jira_migration_type_description()}
      waiting={waiting}
      error={error}
      onBack={onBack}
      onNext={onNext}
    >
      <div className="divide-y divide-border">
        {requirements.issueTypes.map((issueType, index) => (
          <div
            key={issueType.jiraIssueTypeId}
            className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-sm font-medium">{issueType.name}</span>
            <form.Field name={`issueTypes[${index}].projectType`}>
              {(field) => (
                <Select
                  value={field.value ?? ""}
                  onValueChange={(value) => {
                    const option = typeOptions.find(
                      (candidate) => candidate.value === value
                    )
                    if (option) field.handleChange(option.value)
                  }}
                >
                  <SelectTrigger
                    aria-label={issueType.name}
                    placeholder={m.jira_migration_type_title()}
                    className="w-full sm:w-64"
                  />
                  <SelectContent>
                    {typeOptions.map((option, optionIndex) => (
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
