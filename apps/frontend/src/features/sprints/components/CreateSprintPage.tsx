import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { CommandMenuItem } from "@pp/ui/command-menu"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { Timer } from "lucide-react"
import { useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import {
  createSprintInProject,
  newSprintRequest
} from "@/features/sprints/atoms/createSprint"
import {
  completeSprint,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

// "New sprint" from cmd+k: type the name, pick the action. A command that
// completes a sprint into a new one, or files tickets into it, leaves that in
// newSprintRequest first. Dates and the description are set on the sprint
// page afterwards.
export function CreateSprintPage({
  context,
  chip,
  onBack,
  env
}: CommandPageProps) {
  const request = useAtomValue(newSprintRequest)
  const orgSlug = request?.orgSlug ?? context.orgSlug
  const slug = request?.projectSlug ?? context.projectSlug
  const create = useAtomSet(createSprintInProject, { mode: "promiseExit" })
  const [name, setName] = useState("")
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const trimmed = name.trim()
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.sprints_new_name_placeholder()}
      onBack={onBack}
      filter={false}
      notice={failure}
      onSearchChange={(value) => {
        setFailure(null)
        setName(value)
      }}
      items={
        trimmed === "" || slug === null
          ? []
          : [
              {
                value: "create",
                label: m.sprints_command_create_named({ name: trimmed }),
                icon: Timer
              }
            ]
      }
      empty={{
        icon: Timer,
        title: m.sprints_create_dialog_title(),
        description: m.sprints_no_dates_hint()
      }}
      renderItem={(item) => (
        <CommandMenuItem value={item.value}>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </CommandMenuItem>
      )}
      onSelect={async () => {
        if (pending || slug === null || trimmed === "") return
        setPending(true)
        setFailure(null)
        const exit = await create({
          orgSlug,
          slug,
          payload: {
            name: trimmed.slice(0, 120),
            startsAt: null,
            endsAt: null,
            tickets: request?.tickets
          }
        })
        if (Exit.isFailure(exit)) {
          setPending(false)
          setFailure(errorMessage(Cause.squash(exit.cause)))
          return
        }
        const groupId = exit.value.id
        if (request?.completeFrom !== undefined) {
          const completion = await fireMutation(
            env.registry,
            completeSprint({
              req: sprintListRequest(orgSlug, slug),
              groupId: request.completeFrom.id
            }),
            { destination: { kind: "sprint", groupId } }
          )
          if (Result.isFailure(completion)) {
            setPending(false)
            setFailure(errorMessage(Cause.squash(completion.cause)))
            return
          }
        }
        env.registry.set(newSprintRequest, null)
        env.close()
        env.navigate(`/orgs/${orgSlug}/projects/${slug}/sprints/${groupId}`)
      }}
    />
  )
}
