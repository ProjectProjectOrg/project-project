import type { Project } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { ChevronDown } from "@pp/ui/icons"
import { Select, SelectTrigger } from "@pp/ui/select"
import { TextSwap } from "@pp/ui/text-swap"

import { ProjectIconTile } from "@/features/projects/components/ProjectIconTile"
import { m } from "@/paraglide/messages"

type ProjectChoice = Pick<
  Project,
  "slug" | "name" | "icon" | "iconImage" | "color" | "tone" | "colors"
>

function ProjectTile({
  orgSlug,
  project
}: Readonly<{ orgSlug: string; project: ProjectChoice }>) {
  return (
    <ProjectIconTile
      orgSlug={orgSlug}
      icon={project.icon}
      iconImage={project.iconImage}
      color={project.color}
      tone={project.tone}
      colors={project.colors}
      size="xs"
      seed={project.slug}
    />
  )
}

export function ProjectSelect({
  orgSlug,
  projects,
  value,
  onChange,
  readOnly = false
}: Readonly<{
  orgSlug: string
  projects: ReadonlyArray<ProjectChoice>
  value: string | null
  onChange: (slug: string) => void
  readOnly?: boolean
}>) {
  const project = projects.find((entry) => entry.slug === value)
  const label = project?.name ?? m.tickets_create_dialog_project()
  const shown = (
    <TextSwap
      className="gap-1.5"
      iconKey={project?.slug ?? ""}
      icon={
        project === undefined ? undefined : (
          <ProjectTile orgSlug={orgSlug} project={project} />
        )
      }
    >
      {label}
    </TextSwap>
  )
  if (readOnly) {
    return (
      <span className="inline-flex h-7 items-center text-body text-foreground">
        {shown}
      </span>
    )
  }
  return (
    <Select
      items={projects.map((entry) => ({
        value: entry.slug,
        textValue: entry.name,
        label: (
          <span className="flex min-w-0 items-center gap-2">
            <ProjectTile orgSlug={orgSlug} project={entry} />
            <span className="truncate">{entry.name}</span>
          </span>
        )
      }))}
      value={value}
      onValueChange={onChange}
      contentProps={{ align: "start", className: "w-56" }}
    >
      <SelectTrigger
        aria-label={m.tickets_create_project_aria_label({ project: label })}
        render={<Button type="button" variant="ghost" tone="strong" />}
      >
        {shown}
        <ChevronDown className="size-3" strokeWidth={1.75} />
      </SelectTrigger>
    </Select>
  )
}
