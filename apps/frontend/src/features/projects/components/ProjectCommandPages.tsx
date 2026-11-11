import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { CreateProjectInput } from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { FolderKanban, FolderPlus } from "lucide-react"
import { useState } from "react"

import { CommandMenuCheck, CommandMenuItem } from "@/components/ui/command-menu"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import {
  createProject,
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { effectiveProjectKey } from "@/features/projects/forms/create-project/opts"
import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

const isCreateProjectInput = Schema.is(CreateProjectInput)

export function SwitchProjectPage({
  context,
  chip,
  onBack,
  env
}: CommandPageProps) {
  const result = useAtomValue(projectsFor(projectsRequest(context.orgSlug)))
  const projects = Result.isSuccess(result) ? result.value : []
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.chrome_command_menu_switch_project_placeholder()}
      onBack={onBack}
      items={projects
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map((project) => ({
          value: project.slug,
          label: project.name,
          icon: FolderKanban,
          keywords: [project.key]
        }))}
      onSelect={(item) => {
        if (item.value !== context.projectSlug) {
          env.navigate(`/orgs/${context.orgSlug}/projects/${item.value}`)
        }
        env.close()
      }}
      renderItem={(item) => (
        <CommandMenuItem value={item.value}>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {context.projectSlug === item.value && <CommandMenuCheck />}
        </CommandMenuItem>
      )}
    />
  )
}

export function CreateProjectPage({
  context,
  chip,
  onBack,
  env
}: CommandPageProps) {
  const create = useAtomSet(createProject(projectsRequest(context.orgSlug)), {
    mode: "promiseExit"
  })
  const [name, setName] = useState("")
  const [failure, setFailure] = useState<string | null>(null)
  const trimmed = name.trim()
  const key = effectiveProjectKey({ name: trimmed, key: null })
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.chrome_command_menu_create_project_placeholder()}
      onBack={onBack}
      filter={false}
      notice={failure}
      onSearchChange={(value) => {
        setFailure(null)
        setName(value)
      }}
      items={
        trimmed === ""
          ? []
          : [
              {
                value: "create",
                label: m.chrome_command_menu_create_project_named({
                  name: trimmed
                }),
                icon: FolderPlus
              }
            ]
      }
      empty={{
        icon: FolderPlus,
        title: m.chrome_command_menu_create_project_empty_title(),
        description: m.chrome_command_menu_create_project_empty_body()
      }}
      onSelect={async () => {
        const input = { name: trimmed, key }
        if (!isCreateProjectInput(input)) {
          setFailure(m.projects_create_key_invalid())
          return
        }
        setFailure(null)
        const exit = await create(input)
        if (Exit.isFailure(exit)) {
          setFailure(errorMessage(Cause.squash(exit.cause)))
          return
        }
        env.close()
        env.navigate(`/orgs/${context.orgSlug}/projects/${exit.value.slug}`)
      }}
      renderItem={(item) => (
        <CommandMenuItem value={item.value}>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <span className="shrink-0 font-mono text-caption text-muted-foreground">
            {key}
          </span>
        </CommandMenuItem>
      )}
    />
  )
}
