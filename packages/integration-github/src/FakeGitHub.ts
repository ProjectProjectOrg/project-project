import {
  BranchExists,
  ChecksStatus,
  closingTicketIdsInText,
  GitHubError,
  GithubRepo,
  RepoGone,
  branchMentionsTicketId,
  ticketIdsInText,
  type GitHubInstallationAccount,
  type RawBranchEntry,
  type RawMergedPullRequest,
  type RawProjectStates
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { GitHub } from "./GitHub"

const pullRequestFields = {
  number: Schema.Int,
  head: Schema.String,
  base: Schema.String,
  title: Schema.String,
  body: Schema.String,
  checks: ChecksStatus
}

const PullRequest = Schema.Union([
  Schema.Struct({
    ...pullRequestFields,
    state: Schema.Literal("open"),
    draft: Schema.Boolean
  }),
  Schema.Struct({ ...pullRequestFields, state: Schema.Literal("closed") }),
  Schema.Struct({
    ...pullRequestFields,
    state: Schema.Literal("merged"),
    mergedAt: Schema.DateFromString
  })
])
type PullRequest = typeof PullRequest.Type

const Repo = Schema.Struct({
  id: Schema.String,
  owner: Schema.String,
  name: Schema.String,
  defaultBranch: Schema.String,
  branches: Schema.Array(Schema.String),
  pullRequests: Schema.Array(PullRequest)
})
export type Repo = typeof Repo.Type

export const FakeGitHubState = Schema.Struct({ repos: Schema.Array(Repo) })
export type FakeGitHubState = typeof FakeGitHubState.Type

const StateFile = Schema.fromJsonString(FakeGitHubState)
const decodeState = Schema.decodeUnknownEffect(StateFile)
export const encodeState = Schema.encodeSync(StateFile)

const raw = (owner: string, name: string, pr: PullRequest) =>
  ({
    headRefName: pr.head,
    baseRefName: pr.base,
    state: pr.state,
    draft: pr.state === "open" && pr.draft,
    number: pr.number,
    url: `https://github.com/${owner}/${name}/pull/${pr.number}`,
    title: pr.title,
    mergedAt: pr.state === "merged" ? pr.mergedAt : null,
    checks: pr.checks
  }) satisfies RawBranchEntry

const mentionsTicket = (pr: PullRequest) =>
  ticketIdsInText(pr.title).size > 0 || closingTicketIdsInText(pr.body).size > 0

const projectStates = (
  repo: Repo,
  branches: ReadonlyArray<string>,
  branchQuery: string | undefined,
  fetchedAt: Date
) => {
  const open = repo.pullRequests.filter(
    (pr) => pr.state === "open" && pr.head !== repo.defaultBranch
  )
  const openPullRequestText = new Map(
    branchQuery === undefined
      ? []
      : open
          .filter(mentionsTicket)
          .map((pr) => [pr.head, { title: pr.title, body: pr.body }] as const)
  )
  const discovered =
    branchQuery === undefined
      ? []
      : repo.branches.filter(
          (branch) =>
            branch.includes(branchQuery) &&
            branch !== repo.defaultBranch &&
            branchMentionsTicketId(branch)
        )
  const requested = new Set([
    ...branches,
    ...discovered,
    ...openPullRequestText.keys()
  ])
  const prByBranch = new Map<string, RawBranchEntry>()
  const mergedPrsByBranch = new Map<
    string,
    ReadonlyArray<RawMergedPullRequest>
  >()
  for (const branch of requested) {
    const prs = repo.pullRequests
      .filter((pr) => pr.head === branch)
      .toSorted((a, b) => b.number - a.number)
    const latest = prs.find((pr) => pr.state === "open") ?? prs[0]
    if (latest) prByBranch.set(branch, raw(repo.owner, repo.name, latest))
    const merged = prs.flatMap((pr) =>
      pr.state === "merged"
        ? [{ ...raw(repo.owner, repo.name, pr), state: pr.state }]
        : []
    )
    if (merged.length > 0) mergedPrsByBranch.set(branch, merged)
  }
  return {
    defaultBranch: repo.defaultBranch,
    existingBranches: new Set(
      repo.branches.filter((branch) => requested.has(branch))
    ),
    prByBranch,
    mergedPrsByBranch,
    openPullRequestText,
    fetchedAt
  } satisfies RawProjectStates
}

const account = (installationId: string, login: string) =>
  ({
    installationId,
    accountId: login,
    accountLogin: login,
    accountType: "Organization"
  }) satisfies GitHubInstallationAccount

const unsupported = (operation: string) =>
  new GitHubError({ message: `${operation} is not available in fake GitHub` })

export const layer = (statePath: string) =>
  Layer.effect(
    GitHub,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem

      const load = fs.exists(statePath).pipe(
        Effect.flatMap((exists) =>
          exists
            ? fs.readFileString(statePath).pipe(Effect.flatMap(decodeState))
            : Effect.succeed<FakeGitHubState>({ repos: [] })
        ),
        Effect.mapError(
          (cause) =>
            new GitHubError({
              message: `Fake GitHub state unreadable: ${String(cause)}`
            })
        )
      )

      const repoOf = (owner: string, name: string) =>
        load.pipe(
          Effect.flatMap((state) => {
            const repo = state.repos.find(
              (candidate) =>
                candidate.owner === owner && candidate.name === name
            )
            return repo
              ? Effect.succeed({ state, repo })
              : Effect.fail(new RepoGone())
          })
        )

      const save = (
        state: FakeGitHubState,
        repo: Repo,
        change: (repo: Repo) => Repo
      ) =>
        fs
          .writeFileString(
            statePath,
            encodeState({
              repos: state.repos.map((candidate) =>
                candidate === repo ? change(candidate) : candidate
              )
            })
          )
          .pipe(
            Effect.mapError(
              (cause) =>
                new GitHubError({
                  message: `Fake GitHub state unwritable: ${String(cause)}`
                })
            )
          )

      return GitHub.of({
        getInstallationAccount: (_appId, installationId) =>
          load.pipe(
            Effect.map((state) =>
              account(installationId, state.repos[0]?.owner ?? "fake")
            )
          ),
        listInstallationRepos: (_installationId, query) =>
          load.pipe(
            Effect.map((state) => ({
              repos: state.repos
                .filter(
                  (repo) =>
                    query === undefined ||
                    `${repo.owner}/${repo.name}`.includes(query)
                )
                .map((repo) =>
                  GithubRepo.make({
                    id: repo.id,
                    owner: repo.owner,
                    name: repo.name,
                    defaultBranch: repo.defaultBranch,
                    private: true,
                    description: null
                  })
                ),
              hasMore: false
            }))
          ),
        verifyInstallationRepo: (_installationId, owner, name) =>
          repoOf(owner, name).pipe(
            Effect.map(({ repo }) => ({
              repoId: repo.id,
              owner: repo.owner,
              name: repo.name,
              defaultBranch: repo.defaultBranch
            }))
          ),
        exchangeAppUserCode: () =>
          Effect.fail(unsupported("exchangeAppUserCode")),
        convertAppManifest: () =>
          Effect.fail(unsupported("convertAppManifest")),
        listAppUserInstallations: () =>
          load.pipe(
            Effect.map((state) =>
              state.repos.slice(0, 1).map((repo) => account("1", repo.owner))
            )
          ),
        createBranchAsUser: (owner, name, branchName, baseBranch) =>
          Effect.gen(function* () {
            const { state, repo } = yield* repoOf(owner, name)
            if (repo.branches.includes(branchName))
              return yield* new BranchExists({ branch: branchName })
            if (!repo.branches.includes(baseBranch))
              return yield* new RepoGone()
            yield* save(state, repo, (current) => ({
              ...current,
              branches: [...current.branches, branchName]
            }))
            return { name: branchName, sha: "0".repeat(40) }
          }),
        openPullRequestAsUser: (owner, name, args) =>
          Effect.gen(function* () {
            const { state, repo } = yield* repoOf(owner, name)
            const url = (number: number) =>
              `https://github.com/${owner}/${name}/pull/${number}`
            const existing = repo.pullRequests.find(
              (pr) => pr.state === "open" && pr.head === args.head
            )
            if (existing)
              return { number: existing.number, url: url(existing.number) }
            const number =
              Math.max(0, ...repo.pullRequests.map((pr) => pr.number)) + 1
            yield* save(state, repo, (current) => ({
              ...current,
              pullRequests: [
                ...current.pullRequests,
                {
                  number,
                  head: args.head,
                  base: args.base,
                  title: args.title,
                  body: args.body,
                  checks: "none",
                  state: "open",
                  draft: args.draft
                }
              ]
            }))
            return { number, url: url(number) }
          }),
        fetchInstallationProjectStates: (
          _installationId,
          owner,
          name,
          branches,
          branchQuery
        ) =>
          Effect.gen(function* () {
            const { repo } = yield* repoOf(owner, name)
            const now = yield* DateTime.nowAsDate
            return projectStates(repo, branches, branchQuery, now)
          }),
        listInstallationBranches: (
          _installationId,
          owner,
          name,
          query,
          first
        ) =>
          repoOf(owner, name).pipe(
            Effect.map(({ repo }) => {
              const matching = repo.branches.filter(
                (branch) => query === undefined || branch.includes(query)
              )
              return {
                items: matching
                  .slice(0, first)
                  .map((branch) => ({ name: branch, isProtected: false })),
                nextCursor: null,
                totalCount: matching.length
              }
            })
          ),
        branchExistsInstallation: (_installationId, owner, name, branch) =>
          repoOf(owner, name).pipe(
            Effect.map(({ repo }) => repo.branches.includes(branch))
          )
      })
    })
  )
