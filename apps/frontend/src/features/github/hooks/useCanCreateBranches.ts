import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"

import { me } from "@/features/auth/atoms/auth"
import { projectGitStates } from "@/features/github/atoms/github"
import { projectRequest } from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"

export function useCanCreateBranches(): boolean {
  const { orgSlug, slug } = useProjectRoute()
  const viewer = useAtomValue(me())
  const states = useAtomValue(projectGitStates(projectRequest(orgSlug, slug)))
  const connected =
    Result.isSuccess(viewer) && viewer.value.personalGithub.connected
  const tokenUsable =
    !Result.isSuccess(states) || states.value.tokenStatus === "ok"
  return connected && tokenUsable
}
