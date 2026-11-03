import { useAtomValue } from "@effect/atom-react"
import * as Match from "effect/Match"

import { connectGithub } from "@/features/github/atoms/github"
import { projectRequest } from "@/features/projects/atoms/projects"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

export function useConnectGithubError(
  orgSlug: string,
  slug: string
): string | null {
  const state = useAtomValue(connectGithub(projectRequest(orgSlug, slug)))
  if (state.waiting) return null
  return mutationErrorText(
    state,
    (failure) =>
      Match.value(failure).pipe(
        Match.tag("GitHubTokenExpired", () =>
          m.github_chip_connect_token_expired_error()
        ),
        Match.tag("GitHubScopeInsufficient", () =>
          m.github_chip_connect_scope_insufficient_error()
        ),
        Match.tag("RepoGone", () => m.git_repo_gone_error()),
        Match.tag("Conflict", (conflict) =>
          conflict.reason === "github_repo_already_connected"
            ? m.github_chip_connect_repo_taken_error()
            : m.github_chip_connect_failed_error()
        ),
        Match.orElse(() => m.github_chip_connect_failed_error())
      ),
    m.github_chip_connect_failed_error
  )
}
