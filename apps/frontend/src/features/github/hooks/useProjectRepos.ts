import { useAtomValue } from "@effect/atom-react"
import type { GithubConnection } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"

import { connectedRepos } from "@/features/github/lib/repos"
import { project } from "@/features/projects/atoms/projects"
import { useProjectRequest } from "@/features/projects/hooks/useProject"

const NO_REPOS: ReadonlyArray<GithubConnection> = []

export function useProjectRepos(): ReadonlyArray<GithubConnection> {
  const result = useAtomValue(project(useProjectRequest()))
  return Result.isSuccess(result) ? connectedRepos(result.value) : NO_REPOS
}
