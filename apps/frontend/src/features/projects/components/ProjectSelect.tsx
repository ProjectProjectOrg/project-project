import { Button } from "@pp/ui/button"
import { ChevronDown, FolderKanban } from "@pp/ui/icons"
import { Select, SelectTrigger } from "@pp/ui/select"
import { TextSwap } from "@pp/ui/text-swap"

import { m } from "@/paraglide/messages"

export function ProjectSelect({
  projects,
  value,
  onChange,
  readOnly = false
}: Readonly<{
  projects: ReadonlyArray<Readonly<{ slug: string; name: string }>>
  value: string | null
  onChange: (slug: string) => void
  readOnly?: boolean
}>) {
  const project = projects.find((entry) => entry.slug === value)
  const label = project?.name ?? m.tickets_create_dialog_project()
  if (readOnly) {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 px-2.5 text-body text-foreground">
        <TextSwap
          className="gap-1.5"
          icon={<FolderKanban className="size-3.5" strokeWidth={1.75} />}
        >
          {label}
        </TextSwap>
      </span>
    )
  }
  return (
    <Select
      items={projects.map((entry) => ({
        value: entry.slug,
        textValue: entry.name,
        label: entry.name
      }))}
      value={value}
      onValueChange={onChange}
      contentProps={{ align: "start", className: "w-56" }}
    >
      <SelectTrigger
        render={<Button type="button" variant="ghost" tone="strong" />}
      >
        <TextSwap
          className="gap-1.5"
          icon={<FolderKanban className="size-3.5" strokeWidth={1.75} />}
        >
          {label}
        </TextSwap>
        <ChevronDown className="size-3" strokeWidth={1.75} />
      </SelectTrigger>
    </Select>
  )
}
