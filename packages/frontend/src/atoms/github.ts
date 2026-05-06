// GitHub-related atoms.
//
// The mutation atoms here use the project's optimistic-update pattern (see
// CLAUDE.md "Mutations and optimistic updates"): split the read into a
// private `xBaseAtom` + a public `xAtom = Atom.optimistic(xBase)`, then write
// mutations as `Atom.optimisticFn(xAtom, { reducer, fn })`.
//
// Family keys: every project-scoped atom is keyed on `${orgSlug}/${slug}`.
// Slugs are URL-safe (no `/`), so a slash is an unambiguous separator.

import { Atom, Result } from "@effect-atom/atom-react"
import { Effect } from "effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import type {
  AttachBranchInput,
  ConnectGithubInput,
  CreateBranchInput,
  GitState,
  TicketId
} from "@projectproject/shared"
import { projectAtom, projectKey } from "./projects"
import { ticketAtom, ticketKey, ticketsListAtom, ticketsListKey } from "./tickets"

const splitProjectKey = (key: string): { orgSlug: string; slug: string } => {
  const sep = key.indexOf("/")
  return { orgSlug: key.slice(0, sep), slug: key.slice(sep + 1) }
}

export const projectGitStatesBaseAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.projects.gitStates({
          path: { orgSlug, slug }
        })
      })
    )
    .pipe(Atom.setIdleTTL("30 seconds"))
})

export const projectGitStatesAtom = Atom.family((key: string) =>
  Atom.optimistic(projectGitStatesBaseAtom(key))
)

export const githubReposAtom = Atom.family((query: string) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.projects.listRepos({
          urlParams: { q: query.trim() ? query.trim() : undefined, page: 1 }
        })
      })
    )
    .pipe(Atom.setIdleTTL("2 minutes"))
)

// Branch picker for the connect-branch form. Keyed on `"${orgSlug}/${slug} ${q}"`.
// orgSlug + slug are DNS-safe (no spaces) so the first space is the seam
// between the project key and the query.
export const branchesKey = (orgSlug: string, slug: string, q: string) =>
  `${orgSlug}/${slug} ${q}`

export const branchesAtom = Atom.family((key: string) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const sep = key.indexOf(" ")
        const projKey = key.slice(0, sep)
        const q = key.slice(sep + 1)
        const { orgSlug, slug } = splitProjectKey(projKey)
        const client = yield* ApiClient
        return yield* client.projects.listBranches({
          path: { orgSlug, slug },
          urlParams: { q: q.trim() ? q.trim() : undefined }
        })
      })
    )
    .pipe(Atom.setIdleTTL("1 minute"))
)

// --- Mutations -----------------------------------------------------------

export const connectGithubAtom = runtime.fn(
  Effect.fn(function* (
    input: { orgSlug: string; slug: string } & ConnectGithubInput,
    get
  ) {
    const client = yield* ApiClient
    const { orgSlug, slug, ...payload } = input
    const updated = yield* client.projects.connectGithub({
      path: { orgSlug, slug },
      payload
    })
    const key = projectKey(orgSlug, slug)
    get.refresh(projectAtom(key))
    get.refresh(projectGitStatesBaseAtom(key))
    return updated
  })
)

export const disconnectGithubAtom = runtime.fn(
  Effect.fn(function* (input: { orgSlug: string; slug: string }, get) {
    const client = yield* ApiClient
    const updated = yield* client.projects.disconnectGithub({
      path: { orgSlug: input.orgSlug, slug: input.slug }
    })
    const key = projectKey(input.orgSlug, input.slug)
    get.refresh(projectAtom(key))
    get.refresh(projectGitStatesBaseAtom(key))
    return updated
  })
)

export const createBranchAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return Atom.optimisticFn(projectGitStatesAtom(key), {
    reducer: (
      current,
      input: { id: TicketId } & CreateBranchInput
    ) => {
      if (!Result.isSuccess(current)) return current
      const optimistic: GitState = {
        tag: "branch_no_pr",
        name: input.name,
        baseBranch: input.baseBranch ?? "main"
      }
      return Result.success(
        {
          ...current.value,
          states: { ...current.value.states, [input.id]: optimistic }
        },
        { waiting: true }
      )
    },
    fn: runtime.fn(
      Effect.fn(function* (
        input: { id: TicketId } & CreateBranchInput,
        get
      ) {
        const client = yield* ApiClient
        const updated = yield* client.tickets.createBranch({
          path: { orgSlug, slug, id: input.id },
          payload: { name: input.name, baseBranch: input.baseBranch }
        })
        get.refresh(projectGitStatesBaseAtom(key))
        get.refresh(ticketAtom(ticketKey(orgSlug, slug, input.id)))
        get.refresh(ticketsListAtom(ticketsListKey(orgSlug, slug)))
        return updated
      })
    )
  })
})

export const attachBranchAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return Atom.optimisticFn(projectGitStatesAtom(key), {
    reducer: (
      current,
      input: { id: TicketId } & AttachBranchInput
    ) => {
      if (!Result.isSuccess(current)) return current
      const optimistic: GitState = {
        tag: "branch_no_pr",
        name: input.name,
        baseBranch: "main"
      }
      return Result.success(
        {
          ...current.value,
          states: { ...current.value.states, [input.id]: optimistic }
        },
        { waiting: true }
      )
    },
    fn: runtime.fn(
      Effect.fn(function* (
        input: { id: TicketId } & AttachBranchInput,
        get
      ) {
        const client = yield* ApiClient
        const updated = yield* client.tickets.attachBranch({
          path: { orgSlug, slug, id: input.id },
          payload: { name: input.name }
        })
        get.refresh(projectGitStatesBaseAtom(key))
        get.refresh(ticketAtom(ticketKey(orgSlug, slug, input.id)))
        get.refresh(ticketsListAtom(ticketsListKey(orgSlug, slug)))
        return updated
      })
    )
  })
})

export const clearBranchAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return Atom.optimisticFn(projectGitStatesAtom(key), {
    reducer: (current, input: { id: TicketId }) => {
      if (!Result.isSuccess(current)) return current
      const optimistic: GitState = { tag: "no_branch" }
      return Result.success(
        {
          ...current.value,
          states: { ...current.value.states, [input.id]: optimistic }
        },
        { waiting: true }
      )
    },
    fn: runtime.fn(
      Effect.fn(function* (input: { id: TicketId }, get) {
        const client = yield* ApiClient
        const updated = yield* client.tickets.clearBranch({
          path: { orgSlug, slug, id: input.id }
        })
        get.refresh(ticketAtom(ticketKey(orgSlug, slug, input.id)))
        get.refresh(ticketsListAtom(ticketsListKey(orgSlug, slug)))
        get.refresh(projectGitStatesBaseAtom(key))
        return updated
      })
    )
  })
})
