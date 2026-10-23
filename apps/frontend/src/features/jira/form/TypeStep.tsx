import type { JiraMigrationRequirements, TicketType } from "@pp/shared"

import { TYPE_META } from "@/lib/ticket-meta"
import { m } from "@/paraglide/messages"

import { EnumMappingStep } from "./EnumMappingStep"
import type { JiraMigrationForm } from "./opts"

const typeOptions: ReadonlyArray<{
  value: TicketType
  label: () => string
}> = [
  { value: "feat", label: m.jira_migration_type_feature },
  { value: "bug", label: m.jira_migration_type_bug },
  { value: "chore", label: m.jira_migration_type_chore },
  { value: "other", label: m.jira_migration_type_other }
]

export function TypeStep({ form, requirements, ...step }: StepProps) {
  return (
    <EnumMappingStep
      {...step}
      title={m.jira_migration_type_title()}
      description={m.jira_migration_type_description()}
      rows={requirements.issueTypes.map((issueType) => ({
        key: issueType.jiraIssueTypeId,
        name: issueType.name,
        suggested: issueType.suggestedProjectType ?? "other"
      }))}
      options={typeOptions}
      renderIcon={(type) => <MigrationTypeIcon type={type} />}
      renderField={(index, render) => (
        <form.Field name={`issueTypes[${index}].projectType`}>
          {(field) =>
            render({ value: field.value, onChange: field.handleChange })
          }
        </form.Field>
      )}
    />
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
