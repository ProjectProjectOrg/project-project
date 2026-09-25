import type { JiraMigrationRequirements, TicketPriority } from "@pp/shared"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select"
import { PRIORITY_META } from "@/lib/priority-meta"
import { m } from "@/paraglide/messages"

import { MappingLabel, MappingRow } from "./MappingRow"
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
          <MappingRow
            key={priority.jiraPriorityId}
            source={
              <MappingLabel
                icon={
                  <MigrationPriorityIcon
                    priority={priority.suggestedProjectPriority ?? "med"}
                  />
                }
              >
                {priority.name}
              </MappingLabel>
            }
          >
            <form.Field name={`priorities[${index}].projectPriority`}>
              {(field) => {
                const selected = field.value
                  ? PRIORITY_META[field.value]
                  : undefined
                return (
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
                      className="w-full"
                      selectedLabel={
                        selected && field.value ? (
                          <MappingLabel
                            icon={
                              <MigrationPriorityIcon priority={field.value} />
                            }
                          >
                            {priorityOptions
                              .find((option) => option.value === field.value)
                              ?.label()}
                          </MappingLabel>
                        ) : undefined
                      }
                    />
                    <SelectContent>
                      {priorityOptions.map((option, optionIndex) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          index={optionIndex}
                          aria-label={option.label()}
                        >
                          <MappingLabel
                            icon={
                              <MigrationPriorityIcon priority={option.value} />
                            }
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

function MigrationPriorityIcon({ priority }: { priority: TicketPriority }) {
  const meta = PRIORITY_META[priority]
  const Icon = meta.icon
  return <Icon className={`size-4 ${meta.className}`} strokeWidth={1.75} />
}

type StepProps = Readonly<{
  form: JiraMigrationForm
  requirements: JiraMigrationRequirements
  waiting: boolean
  error: string | null
  onBack: () => void
  onNext: () => void
}>
