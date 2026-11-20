import { useAtomValue } from "@effect/atom-react"

import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import { newSprintRequest } from "@/features/sprints/atoms/createSprint"
import { CreateSprintForm } from "@/features/sprints/forms/create-sprint"

// "New sprint" in cmd+k: the full composer, inside the command menu. A
// command that completes a sprint into a new one, or files tickets into it,
// leaves that in newSprintRequest first.
export function CreateSprintPage({ context, env }: CommandPageProps) {
  const request = useAtomValue(newSprintRequest) ?? {
    orgSlug: context.orgSlug,
    projectSlug: context.projectSlug
  }
  return (
    <CreateSprintForm
      request={request}
      onDone={() => {
        env.registry.set(newSprintRequest, null)
        env.close()
      }}
    />
  )
}
