// GitHub-related atoms.
//
// Two reads (gitStates per project, repos per query) and five mutations
// (connect/disconnect repo, createBranch/openPr/clearBranch on tickets).
// Mutations refresh the affected project + ticket atoms; gitStates has a
// short TTL because branch/PR state can change behind our back.

import { Atom } from "@effect-atom/atom-react"
import { Effect } from "effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import type {
  ConnectGithubInput,
  CreateBranchInput,
  OpenPrInput,
  TicketId
} from "@projectproject/shared"
import { projectAtom } from "./projects"
import { ticketAtom, ticketKey, ticketsListAtom } from "./tickets"

// 30s TTL: short enough that the chip feels alive across a normal flow
// (create branch → switch tab → come back), long enough that focus-driven
// refreshes don't hammer the GraphQL endpoint.
export const projectGitStatesAtom = Atom.family((slug: string) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.projects.gitStates({ path: { slug } })
      })
    )
    .pipe(Atom.setIdleTTL("30 seconds"))
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

export const connectGithubAtom = runtime.fn(
  Effect.fn(function* (input: { slug: string } & ConnectGithubInput, get) {
    const client = yield* ApiClient
    const { slug, ...payload } = input
    const updated = yield* client.projects.connectGithub({
      path: { slug },
      payload
    })
    get.refresh(projectAtom(slug))
    get.refresh(projectGitStatesAtom(slug))
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
    get.refresh(projectGitStatesAtom(input.slug))
    return updated
  })
)

export const createBranchAtom = runtime.fn(
  Effect.fn(function* (
    input: { slug: string; id: TicketId } & CreateBranchInput,
    get
  ) {
    const client = yield* ApiClient
    const { slug, id, ...payload } = input
    const updated = yield* client.tickets.createBranch({
      path: { slug, id },
      payload
    })
    get.refresh(ticketAtom(ticketKey(slug, id)))
    get.refresh(ticketsListAtom(slug))
    get.refresh(projectGitStatesAtom(slug))
    return updated
  })
)

export const openPrAtom = runtime.fn(
  Effect.fn(function* (
    input: { slug: string; id: TicketId } & OpenPrInput,
    get
  ) {
    const client = yield* ApiClient
    const { slug, id, ...payload } = input
    const result = yield* client.tickets.openPr({
      path: { slug, id },
      payload
    })
    get.refresh(ticketAtom(ticketKey(slug, id)))
    get.refresh(ticketsListAtom(slug))
    get.refresh(projectGitStatesAtom(slug))
    return result
  })
)

export const clearBranchAtom = runtime.fn(
  Effect.fn(function* (input: { slug: string; id: TicketId }, get) {
    const client = yield* ApiClient
    const updated = yield* client.tickets.clearBranch({
      path: { slug: input.slug, id: input.id }
    })
    get.refresh(ticketAtom(ticketKey(input.slug, input.id)))
    get.refresh(ticketsListAtom(input.slug))
    get.refresh(projectGitStatesAtom(input.slug))
    return updated
  })
)
