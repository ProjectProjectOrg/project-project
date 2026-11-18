import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"

const NO_PROJECTS: ReadonlyArray<Project> = []

const noOrg: Atom.Atom<Result.AsyncResult<ReadonlyArray<Project>, unknown>> =
  Atom.make(Result.success(NO_PROJECTS))

export function useOrgProjects(orgSlug: string | null) {
  const result = useAtomValue(
    orgSlug === null ? noOrg : projectsFor(projectsRequest(orgSlug))
  )
  if (!Result.isSuccess(result)) return NO_PROJECTS
  return result.value.toSorted((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  )
}
