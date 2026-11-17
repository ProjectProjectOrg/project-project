import { Input } from "@pp/ui/input"

import { StepFrame } from "@/components/shell/wizard/StepFrame"
import { sanitizeKey } from "@/features/projects/lib/deriveKey"
import { m } from "@/paraglide/messages"

import type { ProjectImportForm } from "./opts"

export function DestinationStep({
  form,
  sourceName,
  waiting,
  onBack,
  onNext
}: Readonly<{
  form: ProjectImportForm
  sourceName: string
  waiting: boolean
  onBack: () => void
  onNext: () => void
}>) {
  const fields = [
    {
      name: "destination.name",
      label: m.project_import_destination_name(),
      invalid: m.project_import_destination_name_invalid(),
      normalize: (value: string) => value
    },
    {
      name: "destination.slug",
      label: m.project_import_destination_slug(),
      invalid: m.project_import_destination_slug_invalid(),
      normalize: (value: string) => value.toLowerCase()
    },
    {
      name: "destination.key",
      label: m.project_import_destination_key(),
      invalid: m.projects_create_key_invalid(),
      normalize: sanitizeKey
    }
  ] as const

  return (
    <StepFrame
      title={m.project_import_destination_title()}
      description={m.project_import_destination_description({
        name: sourceName
      })}
      waiting={waiting}
      error={null}
      onBack={onBack}
      onNext={onNext}
    >
      <div className="grid max-w-[560px] gap-5">
        {fields.map(({ name, label, invalid, normalize }) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <label className="grid gap-1.5 text-body font-semibold">
                <span>{label}</span>
                <Input
                  value={field.value}
                  aria-invalid={field.errors.length > 0}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(normalize(event.currentTarget.value))
                  }
                />
                {field.errors.length > 0 ? (
                  <span className="text-caption font-normal text-destructive">
                    {invalid}
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
