import type {
  AttachBranchInput,
  BranchListItem,
  ChooseGithubInstallationInput,
  ConnectGithubInput,
  GitState,
  GitStatesResponse,
  GithubRepo,
  GithubRepoPage,
  StackLayerState,
  StartGithubInstallInput,
  TicketId
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { viewMutation } from "@/api/viewMutation"
import {
  mergeStackPrDetails,
  mergeStaleGitStateDetails
} from "@/features/github/lib/gitStateMerge"
import {
  confirmedProject,
  project,
  type ProjectRequest
} from "@/features/projects/atoms/projects"

export type GithubOrgRequest = Readonly<{
  params: Readonly<{ orgSlug: string }>
}>

export const githubOrgRequest = (orgSlug: string): GithubOrgRequest => ({
  params: { orgSlug }
})

export type GithubReposRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
  query: Readonly<{ q: string | undefined }>
}>

export const githubReposRequest = (
  orgSlug: string,
  slug: string,
  q: string
): GithubReposRequest => ({
  params: { orgSlug, slug },
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
    const detail = Option.getOrUndefined(
      AsyncResult.value(get(confirmedProject(req)))
    )
    return detail === undefined ? undefined : (detail.github?.repoId ?? null)
  })
)

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

export const projectGitStatesWaiting = Atom.family((req: ProjectRequest) =>
  Atom.readable((get) => get(gitStatesQuery(req)).waiting)
)

export const invalidateGitStateTickets = Atom.family((req: ProjectRequest) =>
  Api.runtime.fn(
    Effect.fn("invalidateGitStateTickets")(function* (_input: void) {
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
            client.projects.listGithubRepos({
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
              client.projects.listGithubRepos({
                params: req.params,
                query: { q: req.query.q, page }
              })
            )
            repos.push(...next.repos)
            hasMore = next.hasMore
            page += 1
          }
          return repoPage(repos, false)
        }).pipe(Effect.withSpan("githubRepos"))
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

const BRANCH_PAGE_SIZE = 100

const branchPage = (req: BranchesRequest, after: string | null) =>
  Api.query("projects", "listBranches", {
    params: req.params,
    query: {
      ...req.query,
      first: BRANCH_PAGE_SIZE,
      ...(after === null ? {} : { after })
    },
    timeToLive: "1 minute",
    reactivityKeys: [
      Keys.branches(scopeOf(req)),
      Keys.githubAuth(req.params.orgSlug)
    ]
  })

export type BranchListView = Readonly<{
  items: ReadonlyArray<BranchListItem>
  totalCount: number
  hasMore: boolean
  loadingMore: boolean
  loadMoreFailed: boolean
}>

export const moreBranchPages = Atom.family((_req: BranchesRequest) =>
  Atom.make(0).pipe(Atom.setIdleTTL("1 minute"))
)

export type BranchAttempt = Readonly<{
  action: "create" | "attach" | "stack"
  name: string
}>

export const branchAttempt = Atom.family((_id: TicketId) =>
  Atom.make<BranchAttempt | null>(null)
)

export const branches = Atom.family((req: BranchesRequest) => {
  let readCursors: ReadonlyArray<string> = []
  return Atom.readable(
    (get) => {
      const first = get(branchPage(req, null))
      if (!AsyncResult.isSuccess(first)) {
        readCursors = []
        return AsyncResult.map(
          first,
          (): BranchListView => ({
            items: [],
            totalCount: 0,
            hasMore: false,
            loadingMore: false,
            loadMoreFailed: false
          })
        )
      }
      const items = [...first.value.items]
      const cursors: Array<string> = []
      let nextCursor = first.value.nextCursor
      let waiting = first.waiting
      let loadingMore = false
      let loadMoreFailed = false
      const depth = get(moreBranchPages(req))
      for (let index = 0; index < depth && nextCursor !== null; index++) {
        cursors.push(nextCursor)
        const page = get(branchPage(req, nextCursor))
        waiting ||= page.waiting
        if (!AsyncResult.isSuccess(page)) {
          loadingMore = AsyncResult.isInitial(page)
          loadMoreFailed = AsyncResult.isFailure(page)
          break
        }
        items.push(...page.value.items)
        nextCursor = page.value.nextCursor
      }
      readCursors = cursors
      return AsyncResult.success<BranchListView>(
        {
          items,
          totalCount: first.value.totalCount,
          hasMore: nextCursor !== null,
          loadingMore,
          loadMoreFailed
        },
        { waiting }
      )
    },
    (refresh) => {
      refresh(branchPage(req, null))
      for (const cursor of readCursors) refresh(branchPage(req, cursor))
    }
  )
})

const githubKeys = (req: ProjectRequest) => [
  Keys.gitStates(scopeOf(req)),
  Keys.branches(scopeOf(req))
]

export const connectGithub = Atom.family((req: ProjectRequest) =>
  viewMutation(project(req), {
    name: "connectGithub",
    predict: (value, input: ConnectGithubInput) => ({
      ...value,
      github: {
        repoId: input.repoId,
        repoOwner: input.repoOwner,
        repoName: input.repoName,
        defaultBaseBranch: input.defaultBaseBranch ?? null
      }
    }),
    call: (client, input) =>
      client.projects.connectGithub({ params: req.params, payload: input }),
    confirm: (current, updated, input) => ({
      ...current,
      github:
        current.github?.repoId === input.repoId
          ? updated.github
          : current.github
    }),
    publish: () => githubKeys(req)
  })
)

export const disconnectGithub = Atom.family((req: ProjectRequest) =>
  viewMutation(project(req), {
    name: "disconnectGithub",
    predict: (value, _input: void) => ({ ...value, github: null }),
    call: (client) => client.projects.disconnectGithub({ params: req.params }),
    confirm: (current, updated) => ({
      ...current,
      github: current.github === null ? updated.github : current.github
    }),
    publish: () => githubKeys(req)
  })
)

export const startGithubInstall = Atom.family((req: GithubOrgRequest) =>
  Api.runtime.fn(
    Effect.fn("startGithubInstall")(function* (input: StartGithubInstallInput) {
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

export type GithubInstallationChoicesRequest = Readonly<{
  params: Readonly<{ orgSlug: string }>
  query: Readonly<{ state: string }>
}>

export const githubInstallationChoicesRequest = (
  orgSlug: string,
  state: string
): GithubInstallationChoicesRequest => ({
  params: { orgSlug },
  query: { state }
})

export const githubInstallationChoices = Atom.family(
  (req: GithubInstallationChoicesRequest) =>
    Api.query("projects", "githubInstallationChoices", {
      params: req.params,
      query: req.query,
      timeToLive: "10 minutes"
    })
)

export const chooseGithubInstallation = Atom.family((req: GithubOrgRequest) =>
  Api.runtime.fn(
    Effect.fn("chooseGithubInstallation")(function* (
      input: ChooseGithubInstallationInput
    ) {
      const response = yield* Api.use((client) =>
        client.projects.chooseGithubInstallation({
          params: req.params,
          payload: input
        })
      )
      yield* Reactivity.invalidate([Keys.githubIntegration(req.params.orgSlug)])
      return response
    })
  )
)

const gitStateBaseBranch = (state: GitState | undefined): string => {
  if (state === undefined) return ""
  return Match.value(state).pipe(
    Match.when({ tag: "no_branch" }, (current) => current.baseBranch ?? ""),
    Match.when({ tag: "stale_branch" }, () => ""),
    Match.orElse((current) => current.baseBranch)
  )
}

const withGitState = (
  value: GitStatesResponse,
  id: TicketId,
  state: GitState
): GitStatesResponse => ({
  ...value,
  states: { ...value.states, [id]: state }
})

const branchKeys = (req: ProjectRequest, id: TicketId) => [
  Keys.ticketsIn(scopeOf(req)),
  Keys.ticket(scopeOf(req), id)
]

export const createBranch = Atom.family(
  ({ req, id }: GitStateMutationRequest) =>
    viewMutation(projectGitStates(req), {
      name: "createBranch",
      predict: (value, input: CreateBranchMutationInput) =>
        withGitState(value, id, {
          tag: "branch_pending",
          name: input.name,
          baseBranch: input.baseBranch,
          pendingOperation: "create"
        }),
      call: (client, input) =>
        client.tickets.createBranch({
          params: { ...req.params, id },
          payload: { name: input.name, baseBranch: input.baseBranch }
        }),
      confirm: (value, updated) => withGitState(value, id, updated.gitState),
      publish: () => [...branchKeys(req, id), Keys.branches(scopeOf(req))]
    })
)

export const attachBranch = Atom.family(
  ({ req, id }: GitStateMutationRequest) =>
    viewMutation(projectGitStates(req), {
      name: "attachBranch",
      predict: (value, input: AttachBranchInput) =>
        withGitState(value, id, {
          tag: "branch_pending",
          name: input.name,
          baseBranch: gitStateBaseBranch(value.states[id]),
          pendingOperation: "connect"
        }),
      call: (client, input) =>
        client.tickets.attachBranch({
          params: { ...req.params, id },
          payload: { name: input.name }
        }),
      confirm: (value, updated) => withGitState(value, id, updated.gitState),
      publish: () => branchKeys(req, id)
    })
)

const withStack = (
  value: GitStatesResponse,
  id: TicketId,
  stack: ReadonlyArray<StackLayerState>
): GitStatesResponse => ({
  ...value,
  stacks: { ...value.stacks, [id]: stack }
})

const confirmStack = (
  value: GitStatesResponse,
  id: TicketId,
  updated: Readonly<{ stack?: ReadonlyArray<StackLayerState> | null }>
) =>
  withStack(
    value,
    id,
    mergeStackPrDetails(value.stacks?.[id], updated.stack ?? [])
  )

export const stackBranch = Atom.family(({ req, id }: GitStateMutationRequest) =>
  viewMutation(projectGitStates(req), {
    name: "stackBranch",
    predict: (value, input: AttachBranchInput) =>
      withStack(value, id, [
        ...(value.stacks?.[id] ?? []),
        { branch: input.name, base: null, depth: 1, pr: null, deleted: false }
      ]),
    call: (client, input) =>
      client.tickets.stackBranch({
        params: { ...req.params, id },
        payload: { name: input.name }
      }),
    confirm: (value, updated) => confirmStack(value, id, updated),
    publish: () => branchKeys(req, id)
  })
)

export const unstackBranch = Atom.family(
  ({ req, id }: GitStateMutationRequest) =>
    viewMutation(projectGitStates(req), {
      name: "unstackBranch",
      predict: (value, input: AttachBranchInput) =>
        withStack(
          value,
          id,
          (value.stacks?.[id] ?? []).filter(
            (layer) => layer.branch !== input.name
          )
        ),
      call: (client, input) =>
        client.tickets.unstackBranch({
          params: { ...req.params, id },
          payload: { name: input.name }
        }),
      confirm: (value, updated) => confirmStack(value, id, updated),
      publish: () => branchKeys(req, id)
    })
)

export const clearBranch = Atom.family(({ req, id }: GitStateMutationRequest) =>
  viewMutation(projectGitStates(req), {
    name: "clearBranch",
    predict: (value, _input: void) => {
      const baseBranch = gitStateBaseBranch(value.states[id])
      return withStack(
        withGitState(
          value,
          id,
          baseBranch ? { tag: "no_branch", baseBranch } : { tag: "no_branch" }
        ),
        id,
        []
      )
    },
    call: (client) =>
      client.tickets.clearBranch({ params: { ...req.params, id } }),
    confirm: (value, updated) =>
      withStack(
        withGitState(value, id, updated.gitState),
        id,
        updated.stack ?? []
      ),
    publish: () => branchKeys(req, id)
  })
)
