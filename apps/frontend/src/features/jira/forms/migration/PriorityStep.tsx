import type { JiraMigrationRequirements, TicketPriority } from "@pp/shared"

import { PRIORITY_META } from "@/features/tickets/lib/priorityMeta"
import { m } from "@/paraglide/messages"

import { EnumMappingStep } from "./EnumMappingStep"
import type { JiraMigrationForm } from "./opts"

const priorityOptions: ReadonlyArray<{
  value: TicketPriority
  label: () => string
}> = [
  { value: "high", label: m.jira_migration_priority_high },
  { value: "med", label: m.jira_migration_priority_medium },
  { value: "low", label: m.jira_migration_priority_low }
]

export function PriorityStep({ form, requirements, ...step }: StepProps) {
  return (
    <EnumMappingStep
      {...step}
      title={m.jira_migration_priorities_title()}
      description={m.jira_migration_priorities_description()}
      rows={requirements.priorities.map((priority) => ({
        key: priority.jiraPriorityId,
        name: priority.name,
        suggested: priority.suggestedProjectPriority ?? "med"
      }))}
      options={priorityOptions}
      renderIcon={(priority) => <MigrationPriorityIcon priority={priority} />}
      renderField={(index, render) => (
        <form.Field name={`priorities[${index}].projectPriority`}>
          {(field) =>
            render({ value: field.value, onChange: field.handleChange })
          }
        </form.Field>
      )}
    />
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
