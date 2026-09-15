import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import type {
  AttachBranchInput,
  ConnectGithubInput,
  GitState,
  GitStatesResponse,
  GithubRepo,
  GithubRepoPage,
  StartGithubInstallInput,
  TicketId
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { mergeStaleGitStateDetails } from "@/lib/gitStateMerge"
import { project, type ProjectRequest } from "./projects"

export type GithubOrgRequest = Readonly<{
  params: Readonly<{ orgSlug: string }>
}>

export const githubOrgRequest = (orgSlug: string): GithubOrgRequest => ({
  params: { orgSlug }
})

export type GithubReposRequest = Readonly<{
  params: Readonly<{ orgSlug: string }>
  query: Readonly<{ q: string | undefined }>
}>

export const githubReposRequest = (
  orgSlug: string,
  q: string
): GithubReposRequest => ({
  params: { orgSlug },
  query: { q: q.trim() === "" ? undefined : q.trim() }
})

export type BranchesRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
  query: Readonly<{ q: string | undefined }>
}>

export const branchesRequest = (
  orgSlug: string,
  slug: string,
  q: string
): BranchesRequest => ({
  params: { orgSlug, slug },
  query: { q: q.trim() === "" ? undefined : q.trim() }
})

export type GitStateMutationRequest = Readonly<{
  req: ProjectRequest
  id: TicketId
}>

export type CreateBranchMutationInput = Readonly<{
  name: string
  baseBranch: string
}>

const scopeOf = (req: ProjectRequest | BranchesRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const gitStatesQuery = (req: ProjectRequest) =>
  Api.query("projects", "gitStates", {
    params: req.params,
    timeToLive: "30 seconds",
    reactivityKeys: [
      Keys.gitStates(scopeOf(req)),
      Keys.githubAuth(req.params.orgSlug)
    ]
  })

type GitStatesSnapshot = Readonly<{
  repoId: string | null | undefined
  response: GitStatesResponse
}>

const connectedRepoId = Atom.family((req: ProjectRequest) =>
  Atom.readable((get): string | null | undefined => {
    const detail = Option.getOrUndefined(AsyncResult.value(get(project(req))))
    return detail === undefined ? undefined : (detail.github?.repoId ?? null)
  })
)

/**
 * Holds the merge inputs in the atom's own value: `get.self()` is the last
 * response this read produced, and the repo it described. A stale response is
 * merged against it, a repo change discards it.
 */
const gitStatesSnapshot = Atom.family((req: ProjectRequest) =>
  Atom.readable(
    (get) => {
      const repoId = get(connectedRepoId(req))
      const prior = Option.getOrUndefined(
        Option.flatMap(
          get.self<AsyncResult.AsyncResult<GitStatesSnapshot, unknown>>(),
          AsyncResult.value
        )
      )
      return AsyncResult.map(get(gitStatesQuery(req)), (response) => ({
        repoId: repoId ?? prior?.repoId,
        response: mergeStaleGitStateDetails(
          prior?.response,
          response,
          repoId !== undefined &&
            prior?.repoId !== undefined &&
            repoId !== prior.repoId
        )
      }))
    },
    (refresh) => refresh(gitStatesQuery(req))
  )
)

export const projectGitStates = Atom.family((req: ProjectRequest) =>
  Atom.optimistic(
    Atom.readable(
      (get) =>
        AsyncResult.map(
          get(gitStatesSnapshot(req)),
          (snapshot) => snapshot.response
        ),
      (refresh) => refresh(gitStatesSnapshot(req))
    )
  )
)

/**
 * `Atom.optimistic` only forwards settled values, so the wrapper's own
 * `waiting` covers in-flight mutations but never an in-flight read. Polling
 * needs the read's own flag to skip a refresh while one is already running.
 */
export const projectGitStatesWaiting = Atom.family((req: ProjectRequest) =>
  Atom.readable((get) => get(gitStatesQuery(req)).waiting)
)

export const invalidateGitStateTickets = Atom.family((req: ProjectRequest) =>
  Api.runtime.fn(
    Effect.fn(function* (_input: void) {
      yield* Reactivity.invalidate([Keys.ticketsIn(scopeOf(req))])
    })
  )
)

const githubIntegrationQuery = (req: GithubOrgRequest) =>
  Api.query("projects", "githubIntegration", {
    params: req.params,
    timeToLive: "1 minute",
    reactivityKeys: [
      Keys.githubIntegration(req.params.orgSlug),
      Keys.githubAuth(req.params.orgSlug)
    ]
  })

export const githubIntegration = Atom.family((req: GithubOrgRequest) =>
  Atom.optimistic(githubIntegrationQuery(req))
)

const repoPage = (
  repos: ReadonlyArray<GithubRepo>,
  hasMore: boolean
): GithubRepoPage => ({ repos, hasMore })

export const githubRepos = Atom.family((req: GithubReposRequest) =>
  Atom.optimistic(
    Api.runtime
      .atom(
        Effect.gen(function* () {
          const first = yield* Api.use((client) =>
            client.projects.listGithubInstallationRepos({
              params: req.params,
              query: { q: req.query.q, page: 1 }
            })
          )
          if (req.query.q === undefined || !first.hasMore) return first
          const repos: Array<GithubRepo> = [...first.repos]
          let hasMore: boolean = first.hasMore
          let page = 2
          while (hasMore) {
            const next = yield* Api.use((client) =>
              client.projects.listGithubInstallationRepos({
                params: req.params,
                query: { q: req.query.q, page }
              })
            )
            repos.push(...next.repos)
            hasMore = next.hasMore
            page += 1
          }
          return repoPage(repos, false)
        })
      )
      .pipe(
        Atom.withReactivity([
          Keys.githubIntegration(req.params.orgSlug),
          Keys.githubAuth(req.params.orgSlug)
        ]),
        Atom.setIdleTTL("2 minutes")
      )
  )
)

const branchesQuery = (req: BranchesRequest) =>
  Api.query("projects", "listBranches", {
    params: req.params,
    query: req.query,
    timeToLive: "1 minute",
    reactivityKeys: [Keys.branches(scopeOf(req))]
  })

export const branches = Atom.family((req: BranchesRequest) =>
  Atom.optimistic(branchesQuery(req))
)

export const connectGithub = Atom.family((req: ProjectRequest) =>
  Atom.optimisticFn(project(req), {
    reducer: (current, input: ConnectGithubInput) =>
      AsyncResult.map(current, (value) => ({
        ...value,
        github: {
          repoId: input.repoId,
          repoOwner: input.repoOwner,
          repoName: input.repoName,
          defaultBaseBranch: input.defaultBaseBranch ?? null
        }
      })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (input: ConnectGithubInput, get) {
          const updated = yield* Api.use((client) =>
            client.projects.connectGithub({
              params: req.params,
              payload: input
            })
          )
          set(
            AsyncResult.map(get(project(req)), (current) => ({
              ...current,
              github:
                current.github?.repoId === input.repoId
                  ? updated.github
                  : current.github
            }))
          )
          yield* Reactivity.invalidate([
            Keys.gitStates(scopeOf(req)),
            Keys.branches(scopeOf(req))
          ])
          return updated
        })
      )
  })
)

export const disconnectGithub = Atom.family((req: ProjectRequest) =>
  Atom.optimisticFn(project(req), {
    reducer: (current, _input: void) =>
      AsyncResult.map(current, (value) => ({ ...value, github: null })),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (_input: void, get) {
          const updated = yield* Api.use((client) =>
            client.projects.disconnectGithub({ params: req.params })
          )
          set(
            AsyncResult.map(get(project(req)), (current) => ({
              ...current,
              github: current.github === null ? updated.github : current.github
            }))
          )
          yield* Reactivity.invalidate([
            Keys.gitStates(scopeOf(req)),
            Keys.branches(scopeOf(req))
          ])
          return updated
        })
      )
  })
)

export const startGithubInstall = Atom.family((req: GithubOrgRequest) =>
  Api.runtime.fn(
    Effect.fn(function* (input: StartGithubInstallInput) {
      const response = yield* Api.use((client) =>
        client.projects.startGithubInstall({
          params: req.params,
          payload: { returnProjectSlug: input.returnProjectSlug ?? null }
        })
      )
      yield* Reactivity.invalidate([Keys.githubIntegration(req.params.orgSlug)])
      return response
    })
  )
)

const gitStateBaseBranch = (state: GitState | undefined): string => {
  if (state === undefined) return ""
  if (state.tag === "no_branch") return state.baseBranch ?? ""
  if (state.tag === "stale_branch") return ""
  return state.baseBranch
}

const withGitState = (
  value: GitStatesResponse,
  id: TicketId,
  state: GitState
): GitStatesResponse => ({
  ...value,
  states: { ...value.states, [id]: state }
})

export const createBranch = Atom.family(
  ({ req, id }: GitStateMutationRequest) =>
    Atom.optimisticFn(projectGitStates(req), {
      reducer: (current, input: CreateBranchMutationInput) =>
        AsyncResult.map(current, (value) =>
          withGitState(value, id, {
            tag: "branch_pending",
            name: input.name,
            baseBranch: input.baseBranch,
            pendingOperation: "create"
          })
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (input: CreateBranchMutationInput, get) {
            const updated = yield* Api.use((client) =>
              client.tickets.createBranch({
                params: { ...req.params, id },
                payload: { name: input.name, baseBranch: input.baseBranch }
              })
            )
            set(
              AsyncResult.map(get(projectGitStates(req)), (value) =>
                withGitState(value, id, updated.gitState)
              )
            )
            yield* Reactivity.invalidate([
              Keys.ticketsIn(scopeOf(req)),
              Keys.ticket(scopeOf(req), id),
              Keys.branches(scopeOf(req))
            ])
            return updated
          })
        )
    })
)

export const attachBranch = Atom.family(
  ({ req, id }: GitStateMutationRequest) =>
    Atom.optimisticFn(projectGitStates(req), {
      reducer: (current, input: AttachBranchInput) =>
        AsyncResult.map(current, (value) =>
          withGitState(value, id, {
            tag: "branch_pending",
            name: input.name,
            baseBranch: gitStateBaseBranch(value.states[id]),
            pendingOperation: "connect"
          })
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (input: AttachBranchInput, get) {
            const updated = yield* Api.use((client) =>
              client.tickets.attachBranch({
                params: { ...req.params, id },
                payload: { name: input.name }
              })
            )
            set(
              AsyncResult.map(get(projectGitStates(req)), (value) =>
                withGitState(value, id, updated.gitState)
              )
            )
            yield* Reactivity.invalidate([
              Keys.ticketsIn(scopeOf(req)),
              Keys.ticket(scopeOf(req), id)
            ])
            return updated
          })
        )
    })
)

export const clearBranch = Atom.family(({ req, id }: GitStateMutationRequest) =>
  Atom.optimisticFn(projectGitStates(req), {
    reducer: (current, _input: void) =>
      AsyncResult.map(current, (value) => {
        const baseBranch = gitStateBaseBranch(value.states[id])
        return withGitState(
          value,
          id,
          baseBranch ? { tag: "no_branch", baseBranch } : { tag: "no_branch" }
        )
      }),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (_input: void, get) {
          const updated = yield* Api.use((client) =>
            client.tickets.clearBranch({ params: { ...req.params, id } })
          )
          set(
            AsyncResult.map(get(projectGitStates(req)), (value) =>
              withGitState(value, id, updated.gitState)
            )
          )
          yield* Reactivity.invalidate([
            Keys.ticketsIn(scopeOf(req)),
            Keys.ticket(scopeOf(req), id)
          ])
          return updated
        })
      )
  })
)
