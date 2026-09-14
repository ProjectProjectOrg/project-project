import type { JiraMigrationRequirements } from "@projectproject/shared"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select"
import { m } from "@/paraglide/messages"
import type { JiraMigrationForm } from "./opts"
import { StepFrame } from "./StepFrame"

export function StatusStep({
  form,
  requirements,
  waiting,
  error,
  onBack,
  onNext
}: StepProps) {
  return (
    <StepFrame
      title={m.jira_migration_status_title()}
      description={m.jira_migration_status_description()}
      waiting={waiting}
      error={error}
      onBack={onBack}
      onNext={onNext}
    >
      <div className="divide-y divide-border">
        {requirements.statuses.map((status, index) => (
          <div
            key={status.jiraStatusId}
            className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-sm font-medium">{status.name}</span>
            <form.Field name={`statuses[${index}].projectStatusSlug`}>
              {(field) => (
                <Select
                  value={field.value ?? ""}
                  onValueChange={(value) => {
                    const option = requirements.statusOptions.find(
                      (candidate) => candidate.slug === value
                    )
                    if (option) field.handleChange(option.slug)
                  }}
                >
                  <SelectTrigger
                    aria-label={status.name}
                    placeholder={m.jira_migration_status_title()}
                    className="w-full sm:w-64"
                  />
                  <SelectContent>
                    {requirements.statusOptions.map((option, optionIndex) => (
                      <SelectItem
                        key={option.slug}
                        value={option.slug}
                        index={optionIndex}
                      >
                        {option.label}
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
