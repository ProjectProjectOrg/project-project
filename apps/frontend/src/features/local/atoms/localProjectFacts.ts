import type { LocalRepositories } from "@pp/local"
import type { EstimationMode } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Stream from "effect/Stream"

import { connectedRepos } from "@/features/github/lib/repos"
import { project, projectRequest } from "@/features/projects/atoms/projects"

import { LocalClient } from "../lib/localClient"
import {
  type LocalProjectRequest,
  localReady,
  localRuntime
} from "./localProject"

export const localProjectFacts = Atom.family((params: LocalProjectRequest) =>
  localRuntime.atom((get) => {
    const ready = get(localReady(params))
    if (ready === undefined) return Stream.never
    if (!ready) return Stream.make(null)
    return Stream.unwrap(
      Effect.map(LocalClient, (client) => client.ProjectFacts(params))
    )
  })
)

export const localStatuses = Atom.family((params: LocalProjectRequest) =>
  Atom.mapResult(localProjectFacts(params), (facts) => facts?.statuses ?? null)
)

export const localTags = Atom.family((params: LocalProjectRequest) =>
  Atom.mapResult(localProjectFacts(params), (facts) => facts?.tags ?? null)
)

type ProjectRepos = Parameters<typeof connectedRepos>[0]

const repository = (
  repo: NonNullable<ProjectRepos["github"]>
): LocalRepositories["byId"][string] => ({
  repoOwner: repo.repoOwner,
  repoName: repo.repoName,
  defaultBaseBranch: repo.defaultBaseBranch
})

export const repositories = (detail: ProjectRepos): LocalRepositories => ({
  fallback: detail.github === null ? null : repository(detail.github),
  byId: Object.fromEntries(
    connectedRepos(detail).map((repo) => [repo.repoId, repository(repo)])
  )
})

export type LocalViewContext = Readonly<{
  estimation: EstimationMode
  repositories: LocalRepositories
}>

export const localViewContext = Atom.family((params: LocalProjectRequest) =>
  Atom.make((get): LocalViewContext | undefined => {
    const facts = get(localProjectFacts(params))
    if (!AsyncResult.isSuccess(facts) || facts.value === null) return undefined
    const detail = get(project(projectRequest(params.orgSlug, params.slug)))
    if (!AsyncResult.isSuccess(detail)) return undefined
    return {
      estimation: facts.value.project.estimation,
      repositories: repositories(detail.value)
    }
  }).pipe(Atom.withEquality(Equal.equals))
)
