import type { JiraMigrationDestinationConflict } from "@pp/shared"

import { Input } from "@/components/ui/input"
import {
  conflictFor,
  destinationFieldSchemas,
  type DestinationField
} from "@/features/jira/lib/destination"
import type { JiraImportSetup } from "@/features/jira/lib/draft"
import type { JiraSetupCounts } from "@/features/jira/lib/setup"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { validateDestinationField, type JiraImportForm } from "./opts"
import { SetupSection } from "./SetupSection"

const fields: ReadonlyArray<
  Readonly<{
    field: DestinationField
    label: () => string
    hint: () => string
    invalid: () => string
    literal: boolean
  }>
> = [
  {
    field: "name",
    label: m.jira_import_destination_name,
    hint: m.jira_import_destination_name_hint,
    invalid: m.jira_import_destination_name_invalid,
    literal: false
  },
  {
    field: "slug",
    label: m.jira_import_destination_slug,
    hint: m.jira_import_destination_slug_hint,
    invalid: m.jira_import_destination_slug_invalid,
    literal: true
  },
  {
    field: "key",
    label: m.jira_import_destination_key,
    hint: m.jira_import_destination_key_hint,
    invalid: m.jira_import_destination_key_invalid,
    literal: true
  }
]

export function DestinationSection({
  form,
  setup,
  counts,
  conflicts,
  checking,
  open,
  onToggle,
  commit
}: Readonly<{
  form: JiraImportForm
  setup: JiraImportSetup
  counts: JiraSetupCounts
  conflicts: ReadonlyArray<JiraMigrationDestinationConflict>
  checking: boolean
  open: boolean
  onToggle: () => void
  commit: () => void
}>) {
  return (
    <SetupSection
      section="destination"
      counts={counts}
      setup={setup}
      open={open}
      onToggle={onToggle}
    >
      <div className="grid max-w-[560px] gap-4">
        {fields.map(({ field: name, label, hint, invalid, literal }) => (
          <form.Field
            key={name}
            name={`setup.destination.${name}`}
            validators={[
              validateDestinationField(destinationFieldSchemas[name])
            ]}
          >
            {(field) => {
              const error =
                field.errors.length > 0
                  ? invalid()
                  : conflictFor(name, conflicts)
              return (
                <label className="grid gap-1.5 text-body font-semibold">
                  <span>{label()}</span>
                  <Input
                    value={field.value}
                    aria-invalid={error !== null}
                    className={literal ? "font-mono" : undefined}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      field.handleChange(
                        name === "key"
                          ? event.currentTarget.value.toUpperCase()
                          : event.currentTarget.value
                      )
                      commit()
                    }}
                  />
                  <span
                    role={error === null ? undefined : "alert"}
                    className={cn(
                      "min-h-4 text-caption font-normal",
                      error === null
                        ? "text-muted-foreground"
                        : "text-destructive"
                    )}
                  >
                    {error ??
                      (checking && name !== "name"
                        ? m.jira_import_destination_checking()
                        : hint())}
                  </span>
                </label>
              )
            }}
          </form.Field>
        ))}
      </div>
    </SetupSection>
  )
}
