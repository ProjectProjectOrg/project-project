import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import {
  BranchListResponse,
  GitHubError,
  RateLimited,
  RepoGone
} from "@projectproject/shared"
import type { RawBranchEntry, RawProjectStates } from "../../Services/GitHub"
import { graphqlFor } from "./clients"
import { narrow } from "./errors"
import { githubRequest } from "./request"

const FETCH_PROJECT_STATES_QUERY = /* GraphQL */ `
  query FetchProjectStates($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      defaultBranchRef {
        name
      }
      refs(refPrefix: "refs/heads/", first: 100) {
        nodes {
          name
        }
      }
      pullRequests(
        states: [OPEN, MERGED, CLOSED]
        first: 100
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        nodes {
          number
          title
          url
          state
          isDraft
          headRefName
          baseRefName
          mergedAt
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                }
              }
            }
          }
        }
      }
    }
  }
`

const LIST_BRANCHES_QUERY = /* GraphQL */ `
  query ListBranches(
    $owner: String!
    $name: String!
    $q: String
    $first: Int!
  ) {
    repository(owner: $owner, name: $name) {
      refs(
        refPrefix: "refs/heads/"
        query: $q
        first: $first
        orderBy: { field: TAG_COMMIT_DATE, direction: DESC }
      ) {
        nodes {
          name
          branchProtectionRule {
            id
          }
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  }
`

const BRANCH_EXISTS_QUERY = /* GraphQL */ `
  query BranchExists($owner: String!, $name: String!, $ref: String!) {
    repository(owner: $owner, name: $name) {
      ref(qualifiedName: $ref) {
        name
      }
    }
  }
`

interface FetchProjectStatesResponse {
  readonly repository: {
    readonly defaultBranchRef: { readonly name: string } | null
    readonly refs: { readonly nodes: ReadonlyArray<{ readonly name: string }> }
    readonly pullRequests: {
      readonly nodes: ReadonlyArray<{
        readonly number: number
        readonly title: string
        readonly url: string
        readonly state: "OPEN" | "CLOSED" | "MERGED"
        readonly isDraft: boolean
        readonly headRefName: string
        readonly baseRefName: string
        readonly mergedAt: string | null
        readonly commits: {
          readonly nodes: ReadonlyArray<{
            readonly commit: {
              readonly statusCheckRollup: { readonly state: string } | null
            }
          }>
        }
      }>
    }
  } | null
}

interface ListBranchesResponse {
  readonly repository: {
    readonly refs: {
      readonly nodes: ReadonlyArray<{
        readonly name: string
        readonly branchProtectionRule: { readonly id: string } | null
      }>
      readonly pageInfo: { readonly hasNextPage: boolean }
    }
  } | null
}

interface BranchExistsResponse {
  readonly repository: {
    readonly ref: { readonly name: string } | null
  } | null
}

const mapChecks = (s: string | null | undefined): RawBranchEntry["checks"] => {
  if (!s) return "none"
  if (s === "SUCCESS") return "passing"
  if (s === "FAILURE" || s === "ERROR") return "failing"
  if (s === "PENDING" || s === "EXPECTED") return "pending"
  return "neutral"
}

const projectStatesFromResponse = (
  data: FetchProjectStatesResponse
): RawProjectStates | null => {
  if (!data.repository) return null
  const existingBranches = new Set(
    data.repository.refs.nodes.map((r) => r.name)
  )
  const prByBranch = new Map<string, RawBranchEntry>()
  for (const pr of data.repository.pullRequests.nodes) {
    if (prByBranch.has(pr.headRefName)) continue
    prByBranch.set(pr.headRefName, {
      headRefName: pr.headRefName,
      baseRefName: pr.baseRefName,
      state:
        pr.state === "MERGED"
          ? "merged"
          : pr.state === "CLOSED"
            ? "closed"
            : "open",
      draft: pr.isDraft,
      number: pr.number,
      url: pr.url,
      title: pr.title,
      mergedAt: pr.mergedAt
        ? DateTime.toDate(DateTime.unsafeMake(pr.mergedAt))
        : null,
      checks: mapChecks(pr.commits.nodes[0]?.commit.statusCheckRollup?.state)
    })
  }
  return {
    defaultBranch: data.repository.defaultBranchRef?.name ?? "main",
    existingBranches,
    prByBranch
  }
}

const branchListFromResponse = (
  data: ListBranchesResponse
): BranchListResponse | null => {
  if (!data.repository) return null
  return {
    items: data.repository.refs.nodes.map((n) => ({
      name: n.name,
      isProtected: n.branchProtectionRule !== null
    })),
    hasMore: data.repository.refs.pageInfo.hasNextPage
  }
}

export const fetchProjectStatesWithToken = (
  token: string,
  owner: string,
  name: string,
  tokenSource: "user" | "installation"
): Effect.Effect<RawProjectStates, RepoGone | RateLimited | GitHubError> =>
  Effect.gen(function* () {
    const gql = graphqlFor(token)
    const data = yield* githubRequest(
      {
        tokenSource,
        operation: "fetchProjectStates",
        repoOwner: owner,
        repoName: name
      },
      (signal) =>
        gql<FetchProjectStatesResponse>(FETCH_PROJECT_STATES_QUERY, {
          owner,
          name,
          request: { signal }
        }),
      narrow(["RepoGone", "RateLimited"] as const)
    )
    const result = projectStatesFromResponse(data)
    if (!result) return yield* new RepoGone()
    return result
  })

export const listBranchesWithToken = (
  token: string,
  owner: string,
  name: string,
  query: string | undefined,
  first: number,
  tokenSource: "user" | "installation"
): Effect.Effect<BranchListResponse, RepoGone | RateLimited | GitHubError> =>
  Effect.gen(function* () {
    const gql = graphqlFor(token)
    const data = yield* githubRequest(
      {
        tokenSource,
        operation: "listBranches",
        repoOwner: owner,
        repoName: name,
        query: query ?? null,
        first
      },
      (signal) =>
        gql<ListBranchesResponse>(LIST_BRANCHES_QUERY, {
          owner,
          name,
          q: query ?? null,
          first,
          request: { signal }
        }),
      narrow(["RepoGone", "RateLimited"] as const)
    )
    const result = branchListFromResponse(data)
    if (!result) return yield* new RepoGone()
    return result
  })

export const branchExistsWithToken = (
  token: string,
  owner: string,
  name: string,
  branch: string,
  tokenSource: "user" | "installation"
): Effect.Effect<boolean, RepoGone | RateLimited | GitHubError> =>
  Effect.gen(function* () {
    const gql = graphqlFor(token)
    const data = yield* githubRequest(
      {
        tokenSource,
        operation: "branchExists",
        repoOwner: owner,
        repoName: name,
        branch
      },
      (signal) =>
        gql<BranchExistsResponse>(BRANCH_EXISTS_QUERY, {
          owner,
          name,
          ref: `refs/heads/${branch}`,
          request: { signal }
        }),
      narrow(["RepoGone", "RateLimited"] as const)
    )
    if (!data.repository) return yield* new RepoGone()
    return data.repository.ref !== null
  })
