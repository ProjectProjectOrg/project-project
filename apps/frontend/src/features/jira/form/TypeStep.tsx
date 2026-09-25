import type { JiraMigrationRequirements, TicketType } from "@pp/shared"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select"
import { TYPE_META } from "@/lib/ticket-meta"
import { m } from "@/paraglide/messages"

import { MappingLabel, MappingRow } from "./MappingRow"
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
          <MappingRow
            key={issueType.jiraIssueTypeId}
            source={
              <MappingLabel
                icon={
                  <MigrationTypeIcon
                    type={issueType.suggestedProjectType ?? "other"}
                  />
                }
              >
                {issueType.name}
              </MappingLabel>
            }
          >
            <form.Field name={`issueTypes[${index}].projectType`}>
              {(field) => {
                const selected = field.value
                  ? TYPE_META[field.value]
                  : undefined
                return (
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
                      className="w-full"
                      selectedLabel={
                        selected && field.value ? (
                          <MappingLabel
                            icon={<MigrationTypeIcon type={field.value} />}
                          >
                            {typeOptions
                              .find((option) => option.value === field.value)
                              ?.label()}
                          </MappingLabel>
                        ) : undefined
                      }
                    />
                    <SelectContent>
                      {typeOptions.map((option, optionIndex) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          index={optionIndex}
                          aria-label={option.label()}
                        >
                          <MappingLabel
                            icon={<MigrationTypeIcon type={option.value} />}
                          >
                            {option.label()}
                          </MappingLabel>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }}
            </form.Field>
          </MappingRow>
        ))}
      </div>
    </StepFrame>
  )
}

function typeColorClass(type: TicketType) {
  switch (type) {
    case "feat":
      return "text-state-success"
    case "bug":
      return "text-state-danger"
    case "chore":
      return "text-state-warning"
    case "other":
      return "text-muted-foreground"
  }
  return "text-muted-foreground"
}

function MigrationTypeIcon({ type }: { type: TicketType }) {
  const Icon = TYPE_META[type].icon
  return (
    <Icon className={`size-4 ${typeColorClass(type)}`} strokeWidth={1.75} />
  )
}

type StepProps = Readonly<{
  form: JiraMigrationForm
  requirements: JiraMigrationRequirements
  waiting: boolean
  error: string | null
  onBack: () => void
  onNext: () => void
}>
