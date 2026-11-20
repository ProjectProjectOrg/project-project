import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { JiraProjectChoice } from "@pp/shared"
import {
  CommandMenu,
  CommandMenuEmpty,
  CommandMenuInput,
  CommandMenuItem,
  CommandMenuList
} from "@pp/ui/command-menu"
import { Check } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { WeightLabel } from "@pp/ui/weight-label"
import { useEffect, useRef, useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { ReadFailure } from "@/components/shell/ReadFailure"
import {
  jiraProjects,
  jiraProjectsRequest
} from "@/features/jira/atoms/jiraMigration"
import { filterJiraProjects } from "@/features/jira/lib/source"
import { m } from "@/paraglide/messages"

export const pickerHeightClass = "h-74"
const pickerMaxHeightClass = "max-h-74"

export function ProjectPicker({
  cloudId,
  projectId,
  onPick
}: Readonly<{
  cloudId: string
  projectId: string
  onPick: (projectId: string) => void
}>) {
  const atom = jiraProjects(jiraProjectsRequest(cloudId))
  const result = useAtomValue(atom)
  const refresh = useAtomRefresh(atom)
  return (
    <div className="flex flex-col gap-2">
      <span className="text-body font-semibold text-foreground">
        {m.jira_import_source_project_label()}
      </span>
      <AsyncView
        result={result}
        onInitial={() => (
          <div
            className={cn("w-full skeleton rounded-xl", pickerHeightClass)}
          />
        )}
        onFailure={(failure) => (
          <ReadFailure
            failure={failure}
            onRetry={refresh}
            className={cn(
              "items-start rounded-xl border border-border px-3 py-2",
              pickerHeightClass
            )}
          />
        )}
        onSuccess={({ value }) => (
          <ProjectList projects={value} projectId={projectId} onPick={onPick} />
        )}
      />
    </div>
  )
}

function ProjectList({
  projects,
  projectId,
  onPick
}: Readonly<{
  projects: ReadonlyArray<JiraProjectChoice>
  projectId: string
  onPick: (projectId: string) => void
}>) {
  const [search, setSearch] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    searchRef.current?.focus({ preventScroll: true })
  }, [])
  const items = filterJiraProjects(projects, search).map((project) => ({
    value: project.id,
    label: project.name
  }))
  const byId = new Map(projects.map((project) => [project.id, project]))
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <CommandMenu
        className={pickerMaxHeightClass}
        items={items}
        onSelect={(item) => onPick(item.value)}
      >
        <CommandMenuInput
          ref={searchRef}
          aria-label={m.jira_import_source_project_search()}
          placeholder={m.jira_import_source_project_search()}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <CommandMenuList
          renderItem={(item) => {
            const project = byId.get(item.value)
            return (
              <CommandMenuItem value={item.value}>
                <span className="w-16 shrink-0 truncate text-caption text-muted-foreground tabular-nums">
                  {project?.key}
                </span>
                <span className="flex min-w-0 flex-1">
                  <WeightLabel active={item.value === projectId} truncate>
                    {item.label}
                  </WeightLabel>
                </span>
                {item.value === projectId ? (
                  <Check
                    className="size-3.5 shrink-0 text-foreground"
                    strokeWidth={2}
                    aria-label={m.jira_import_source_project_selected()}
                  />
                ) : null}
              </CommandMenuItem>
            )
          }}
        >
          <CommandMenuEmpty>
            {projects.length === 0
              ? m.jira_import_source_no_projects()
              : m.jira_import_filter_empty()}
          </CommandMenuEmpty>
        </CommandMenuList>
      </CommandMenu>
    </div>
  )
}
