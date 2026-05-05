// GitHub-related atoms.
//
// The mutation atoms here use the project's optimistic-update pattern (see
// CLAUDE.md "Mutations and optimistic updates"): split the read into a
// private `xBaseAtom` + a public `xAtom = Atom.optimistic(xBase)`, then write
// mutations as `Atom.optimisticFn(xAtom, { reducer, fn })`. The reducer
// synthesises the post-mutation state synchronously so the UI flips before the
// roundtrip; on failure Atom.optimistic auto-reverts.

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
import { projectAtom } from "./projects"
import { ticketAtom, ticketKey, ticketsListAtom } from "./tickets"

// Private — server-truthy fetch. Wrapped by `projectGitStatesAtom` below.
// 30s TTL: short enough that the chip feels alive across a normal flow,
// long enough that focus-driven refreshes don't hammer GraphQL.
const projectGitStatesBaseAtom = Atom.family((slug: string) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.projects.gitStates({ path: { slug } })
      })
    )
    .pipe(Atom.setIdleTTL("30 seconds"))
)

// Public — mirrors the base, accepts optimistic writes from mutation atoms.
// Reverts to the base value on mutation failure; carries `waiting: true` on
// the Result while a mutation is in flight.
export const projectGitStatesAtom = Atom.family((slug: string) =>
  Atom.optimistic(projectGitStatesBaseAtom(slug))
)

// Repo picker. Re-keyed on every search query change so each query gets its
// own cache cell. Empty query is its own key — ranks the user's recent repos.
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

// Branch picker for the connect-branch form. Keyed on a "slug q" string —
// Atom.family compares keys by reference / value, so an object key produces
// a fresh family member on every render and triggers an infinite refetch.
// Slugs are URL-safe (no spaces), so the first space is an unambiguous seam.
export const branchesKey = (slug: string, q: string) => `${slug} ${q}`

export const branchesAtom = Atom.family((key: string) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const sep = key.indexOf(" ")
        const slug = key.slice(0, sep)
        const q = key.slice(sep + 1)
        const client = yield* ApiClient
        return yield* client.projects.listBranches({
          path: { slug },
          urlParams: { q: q.trim() ? q.trim() : undefined }
        })
      })
    )
    .pipe(Atom.setIdleTTL("1 minute"))
)

// --- Mutations -----------------------------------------------------------

export const connectGithubAtom = runtime.fn(
  Effect.fn(function* (input: { slug: string } & ConnectGithubInput, get) {
    const client = yield* ApiClient
    const { slug, ...payload } = input
    const updated = yield* client.projects.connectGithub({
      path: { slug },
      payload
    })
    get.refresh(projectAtom(slug))
    get.refresh(projectGitStatesBaseAtom(slug))
    return updated
  })
)

export const disconnectGithubAtom = runtime.fn(
  Effect.fn(function* (input: { slug: string }, get) {
    const client = yield* ApiClient
    const updated = yield* client.projects.disconnectGithub({
      path: { slug: input.slug }
    })
    get.refresh(projectAtom(input.slug))
    get.refresh(projectGitStatesBaseAtom(input.slug))
    return updated
  })
)

// Optimistic: synthesises a `branch_no_pr` entry for the ticket, then resolves
// against server truth via a base refresh. Family-keyed on slug because
// `Atom.optimisticFn` is bound at construction to a specific atom instance.
export const createBranchAtom = Atom.family((slug: string) =>
  Atom.optimisticFn(projectGitStatesAtom(slug), {
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
          path: { slug, id: input.id },
          payload: { name: input.name, baseBranch: input.baseBranch }
        })
        get.refresh(projectGitStatesBaseAtom(slug))
        get.refresh(ticketAtom(ticketKey(slug, input.id)))
        get.refresh(ticketsListAtom(slug))
        return updated
      })
    )
  })
)

// Optimistic: same shape as createBranch — attaching an existing branch lands
// in the same `branch_no_pr` state. We don't know the actual base branch
// client-side; the base refresh corrects it.
export const attachBranchAtom = Atom.family((slug: string) =>
  Atom.optimisticFn(projectGitStatesAtom(slug), {
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
          path: { slug, id: input.id },
          payload: { name: input.name }
        })
        get.refresh(projectGitStatesBaseAtom(slug))
        get.refresh(ticketAtom(ticketKey(slug, input.id)))
        get.refresh(ticketsListAtom(slug))
        return updated
      })
    )
  })
)

// Optimistic: clearing a branch sends the ticket back to `no_branch`. Cheap
// to model client-side; reducer flips the entry, base refresh confirms.
export const clearBranchAtom = Atom.family((slug: string) =>
  Atom.optimisticFn(projectGitStatesAtom(slug), {
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
          path: { slug, id: input.id }
        })
        get.refresh(ticketAtom(ticketKey(slug, input.id)))
        get.refresh(ticketsListAtom(slug))
        get.refresh(projectGitStatesBaseAtom(slug))
        return updated
      })
    )
  })
)
