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

const unlinkedValue = "__unlinked__"

export function PeopleStep({
  form,
  requirements,
  waiting,
  error,
  onBack,
  onNext
}: StepProps) {
  return (
    <StepFrame
      title={m.jira_migration_people_title()}
      description={m.jira_migration_people_description()}
      waiting={waiting}
      error={error}
      onBack={onBack}
      onNext={onNext}
    >
      <div className="divide-y divide-border">
        {requirements.identities.map((identity, index) => (
          <div
            key={identity.jiraAccountId}
            className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {identity.displayName}
              </div>
              {identity.email ? (
                <div className="truncate text-xs text-muted-foreground">
                  {identity.email}
                </div>
              ) : null}
            </div>
            <form.Field name={`identities[${index}].projectProjectUserId`}>
              {(field) => (
                <Select
                  value={
                    field.value === undefined
                      ? ""
                      : field.value === null
                        ? unlinkedValue
                        : field.value
                  }
                  onValueChange={(value) =>
                    field.handleChange(value === unlinkedValue ? null : value)
                  }
                >
                  <SelectTrigger
                    aria-label={identity.displayName}
                    placeholder={m.jira_migration_people_title()}
                    className="w-full sm:w-64"
                  />
                  <SelectContent>
                    <SelectItem value={unlinkedValue} index={0}>
                      {m.jira_migration_people_dont_link()}
                    </SelectItem>
                    {requirements.identityOptions.map((option, optionIndex) => (
                      <SelectItem
                        key={option.id}
                        value={option.id}
                        index={optionIndex + 1}
                      >
                        {option.name}
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
