import {
  BranchExists,
  BranchProtected,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  RateLimited,
  RepoGone
} from "@projectproject/shared"

export type GitHubFailure =
  | GitHubTokenExpired
  | GitHubScopeInsufficient
  | RepoGone
  | BranchExists
  | BranchProtected
  | RateLimited
  | GitHubError

const HTTP_STATUS_KEY = "status"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

export const githubErrorMessage = (cause: unknown): string => {
  if (!isRecord(cause)) return "GitHub error"
  const message = cause.message
  return typeof message === "string" ? message : "GitHub error"
}

const header = (
  headers: Record<string, unknown> | undefined,
  name: string
): string | undefined => {
  const value = headers?.[name]
  return typeof value === "string" ? value : undefined
}

const isAllowedFailure = <
  const Allow extends ReadonlyArray<GitHubFailure["_tag"]>
>(
  err: GitHubFailure,
  allow: Allow
): err is Extract<GitHubFailure, { _tag: Allow[number] }> =>
  allow.some((tag) => tag === err._tag)

export function mapHttpError(
  cause: unknown,
  nowSeconds: number,
  context?: { readonly branch?: string }
): GitHubFailure {
  const err = isRecord(cause) ? cause : undefined
  const statusValue = err?.[HTTP_STATUS_KEY]
  const status = typeof statusValue === "number" ? statusValue : undefined
  const message = githubErrorMessage(cause)
  const response = err?.response
  const headers =
    isRecord(response) && isRecord(response.headers)
      ? response.headers
      : undefined
  const resetHeader =
    header(headers, "x-ratelimit-reset") ?? header(headers, "X-RateLimit-Reset")
  const parsedResetAt = resetHeader ? Number(resetHeader) : undefined
  const resetAt =
    parsedResetAt !== undefined && Number.isFinite(parsedResetAt)
      ? parsedResetAt
      : nowSeconds + 60

  if (status === 401) return new GitHubTokenExpired()
  if (status === 403) {
    if (/rate.?limit|abuse/i.test(message)) {
      return new RateLimited({
        resetAt
      })
    }
    return new GitHubScopeInsufficient()
  }
  if (status === 404) return new RepoGone()
  if (status === 422) {
    if (/already exists/i.test(message)) {
      return context?.branch
        ? new BranchExists({ branch: context.branch })
        : new GitHubError({ message })
    }
    if (/protected/i.test(message)) {
      return context?.branch
        ? new BranchProtected({ branch: context.branch })
        : new GitHubError({ message })
    }
    return new GitHubError({ message })
  }
  if (status === 429) {
    return new RateLimited({
      resetAt
    })
  }
  return new GitHubError({ message })
}

export type TaggedFailure = { readonly _tag: string }

export const narrow =
  <const Allow extends ReadonlyArray<GitHubFailure["_tag"]>>(allow: Allow) =>
  (
    cause: unknown,
    nowSecs: number
  ): Extract<GitHubFailure, { _tag: Allow[number] }> | GitHubError => {
    const err = mapHttpError(cause, nowSecs)
    if (isAllowedFailure(err, allow)) return err
    return new GitHubError({ message: err._tag })
  }
