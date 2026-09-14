import { Input } from "@/components/ui/input"
import { m } from "@/paraglide/messages"
import type { JiraMigrationForm } from "./opts"
import { StepFrame } from "./StepFrame"

export function DestinationStep({
  form,
  waiting,
  error,
  onBack,
  onNext
}: StepProps) {
  const fields = [
    {
      name: "destination.name" as const,
      label: m.jira_migration_destination_name()
    },
    {
      name: "destination.slug" as const,
      label: m.jira_migration_destination_slug()
    },
    {
      name: "destination.key" as const,
      label: m.jira_migration_destination_key()
    }
  ]

  return (
    <StepFrame
      title={m.jira_migration_destination_title()}
      description={m.jira_migration_destination_description()}
      waiting={waiting}
      error={error}
      onBack={onBack}
      onNext={onNext}
    >
      <div className="grid max-w-xl gap-5">
        {fields.map(({ name, label }) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <label className="grid gap-2 text-sm font-medium">
                <span>{label}</span>
                <Input
                  value={field.value}
                  aria-invalid={field.errors.length > 0}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(event.currentTarget.value)
                  }
                />
                {field.errors.length > 0 ? (
                  <span className="text-xs font-normal text-destructive">
                    {m.jira_migration_destination_invalid()}
                  </span>
                ) : null}
              </label>
            )}
          </form.Field>
        ))}
      </div>
    </StepFrame>
  )
}

interface StepProps {
  form: JiraMigrationForm
  waiting: boolean
  error: string | null
  onBack: () => void
  onNext: () => void
}
