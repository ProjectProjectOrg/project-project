import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"

import { projectGitStates } from "@/features/github/atoms/github"
import { projectRequest } from "@/features/projects/atoms/projects"
import { m } from "@/paraglide/messages"

export function useGithubWarning(orgSlug: string, slug: string): string | null {
  const req = projectRequest(orgSlug, slug)
  const states = useAtomValue(projectGitStates(req))
  if (!Result.isSuccess(states)) return null
  const { tokenStatus, repoStatus } = states.value
  if (tokenStatus === "expired") return m.git_github_token_expired_error()
  if (tokenStatus === "scope_insufficient")
    return m.git_github_scope_insufficient_error()
  if (repoStatus === "gone") return m.git_repo_gone_error()
  return null
}
