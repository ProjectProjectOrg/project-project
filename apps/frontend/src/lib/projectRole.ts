import { useAtomValue } from "@effect/atom-react"
import type { Role } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { me } from "@/features/auth/atoms/auth"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"

export function useProjectRole(): Readonly<{ role: Role; isPm: boolean }> {
  const project = useProject()
  const viewer = useAtomValue(me())
  const role: Role = Result.isSuccess(viewer)
    ? (project.members.find((member) => member.id === viewer.value.id)?.role ??
      "developer")
    : "developer"
  return { role, isPm: role === "pm" }
}
