import { useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import * as Match from "effect/Match"
import type * as Atom from "effect/reactivity/Atom"

import {
  attachBranch,
  branchAttempt,
  createBranch,
  stackBranch
} from "@/features/github/atoms/github"
import { projectRequest } from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

type AttachState = Atom.Type<ReturnType<typeof attachBranch>>

export function BranchAttemptError({ id }: Readonly<{ id: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const request = { req: projectRequest(orgSlug, slug), id }
  const attempt = useAtomValue(branchAttempt(id))
  const createState = useAtomValue(createBranch(request))
  const attachState = useAtomValue(attachBranch(request))
  const stackState = useAtomValue(stackBranch(request))
  if (attempt === null) return null
  const text =
    attempt.action === "create"
      ? createErrorText(createState, attempt.name)
      : attachErrorText(
          attempt.action === "stack" ? stackState : attachState,
          attempt.name
        )
  if (text === null) return null
  return (
    <p role="alert" className="text-xs text-destructive">
      {text}
    </p>
  )
}

function createErrorText(
  state: Atom.Type<ReturnType<typeof createBranch>>,
  name: string
): string | null {
  if (state.waiting) return null
  return mutationErrorText(
    state,
    (error) =>
      Match.value(error).pipe(
        Match.tag("BranchExists", () => m.git_branch_exists_error({ name })),
        Match.tag("BranchProtected", () => m.git_branch_protected_error()),
        Match.tag("GitHubTokenExpired", () =>
          m.git_github_token_expired_error()
        ),
        Match.tag("GitHubScopeInsufficient", () =>
          m.git_github_scope_insufficient_error()
        ),
        Match.tag("RepoGone", () => m.git_repo_gone_error()),
        Match.orElse(() => m.git_create_branch_error())
      ),
    m.git_create_branch_error
  )
}

function attachErrorText(state: AttachState, name: string): string | null {
  if (state.waiting) return null
  return mutationErrorText(
    state,
    (error) =>
      Match.value(error).pipe(
        Match.tag("BranchNotFound", () =>
          m.git_branch_not_found_error({ name })
        ),
        Match.tag("GitHubTokenExpired", () =>
          m.git_github_token_expired_error()
        ),
        Match.tag("GitHubScopeInsufficient", () =>
          m.git_github_scope_insufficient_error()
        ),
        Match.tag("RepoGone", () => m.git_repo_gone_error()),
        Match.tag("Conflict", ({ reason }) =>
          Match.value(reason).pipe(
            Match.when("branch_on_other_ticket", () =>
              m.git_stack_branch_on_other_ticket_error()
            ),
            Match.when("branch_already_on_ticket", () =>
              m.git_stack_branch_already_on_ticket_error()
            ),
            Match.orElse(() => m.git_attach_branch_error())
          )
        ),
        Match.orElse(() => m.git_attach_branch_error())
      ),
    m.git_attach_branch_error
  )
}
