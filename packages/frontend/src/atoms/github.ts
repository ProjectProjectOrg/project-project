import { Atom, Result } from "@effect-atom/atom-react"
import { AppApiClient } from "@/services/AppApiClient"
import { ReactivityKey } from "@/atoms/reactivity-keys"
import {
  branchesKey,
  gitStatesKey,
  reposKey,
  type BranchesKey,
  type ProjectKey,
  type ReposKey
} from "@/atoms/keys"
import type { GitState } from "@projectproject/shared"

export { branchesKey, gitStatesKey, reposKey }

export const projectGitStatesBaseAtom = Atom.family(
  ({ orgSlug, slug }: ProjectKey) =>
    AppApiClient.query("projects", "gitStates", {
      path: { orgSlug, slug },
      reactivityKeys: [ReactivityKey.github],
      timeToLive: "30 seconds"
    })
)

export const projectGitStatesAtom = Atom.family((key: ProjectKey) =>
  Atom.optimistic(projectGitStatesBaseAtom(key))
)

export const githubReposAtom = Atom.family(({ q }: ReposKey) =>
  AppApiClient.query("projects", "listRepos", {
    urlParams: { q: q.trim() ? q.trim() : undefined, page: 1 },
    timeToLive: "2 minutes"
  })
)

export const branchesAtom = Atom.family(({ orgSlug, slug, q }: BranchesKey) =>
  AppApiClient.query("projects", "listBranches", {
    path: { orgSlug, slug },
    urlParams: { q: q.trim() ? q.trim() : undefined },
    timeToLive: "1 minute"
  })
)

// --- Mutations -----------------------------------------------------------

export const connectGithubAtom = Atom.family((_key: ProjectKey) =>
  AppApiClient.mutation("projects", "connectGithub")
)

export const disconnectGithubAtom = Atom.family((_key: ProjectKey) =>
  AppApiClient.mutation("projects", "disconnectGithub")
)

export const createBranchAtom = Atom.family((key: ProjectKey) =>
  projectGitStatesAtom(key).pipe(
    Atom.optimisticFn({
      reducer: (current, arg) => {
        if (!Result.isSuccess(current)) return current
        const optimistic: GitState = {
          tag: "branch_no_pr",
          name: arg.payload.name,
          baseBranch: arg.payload.baseBranch ?? "main"
        }
        return Result.success(
          {
            ...current.value,
            states: { ...current.value.states, [arg.path.id]: optimistic }
          },
          { waiting: true }
        )
      },
      fn: AppApiClient.mutation("tickets", "createBranch")
    })
  )
)

export const attachBranchAtom = Atom.family((key: ProjectKey) =>
  projectGitStatesAtom(key).pipe(
    Atom.optimisticFn({
      reducer: (current, arg) => {
        if (!Result.isSuccess(current)) return current
        const optimistic: GitState = {
          tag: "branch_no_pr",
          name: arg.payload.name,
          baseBranch: "main"
        }
        return Result.success(
          {
            ...current.value,
            states: { ...current.value.states, [arg.path.id]: optimistic }
          },
          { waiting: true }
        )
      },
      fn: AppApiClient.mutation("tickets", "attachBranch")
    })
  )
)

export const clearBranchAtom = Atom.family((key: ProjectKey) =>
  projectGitStatesAtom(key).pipe(
    Atom.optimisticFn({
      reducer: (current, arg) => {
        if (!Result.isSuccess(current)) return current
        const optimistic: GitState = { tag: "no_branch" }
        return Result.success(
          {
            ...current.value,
            states: { ...current.value.states, [arg.path.id]: optimistic }
          },
          { waiting: true }
        )
      },
      fn: AppApiClient.mutation("tickets", "clearBranch")
    })
  )
)
