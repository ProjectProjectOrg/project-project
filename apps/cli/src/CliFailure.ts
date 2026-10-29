import * as Data from "effect/Data"
import * as Runtime from "effect/Runtime"

export const ExitCode = {
  failure: 1,
  usage: 2,
  notSignedIn: 3,
  forbidden: 4,
  notFound: 5,
  invalidInput: 6,
  conflict: 7,
  unreachable: 8,
  externalService: 9,
  outdated: 10
} as const

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode]

export class CliFailure extends Data.TaggedError("CliFailure")<
  Readonly<{ message: string; code: ExitCode }>
> {
  get [Runtime.errorExitCode]() {
    return this.code
  }

  readonly [Runtime.errorReported] = false
}

const exitCodeByError: Readonly<Record<string, ExitCode>> = {
  Unauthorized: ExitCode.notSignedIn,
  Forbidden: ExitCode.forbidden,
  NotFound: ExitCode.notFound,
  Validation: ExitCode.invalidInput,
  MentionInvalid: ExitCode.invalidInput,
  AttachmentTooLarge: ExitCode.invalidInput,
  AttachmentTypeRejected: ExitCode.invalidInput,
  Conflict: ExitCode.conflict,
  SprintCompletedImmutable: ExitCode.conflict,
  StorageNotConnected: ExitCode.externalService,
  StorageConfigMissing: ExitCode.externalService,
  StorageError: ExitCode.externalService,
  BranchNotFound: ExitCode.externalService,
  GitHubTokenExpired: ExitCode.externalService,
  GitHubScopeInsufficient: ExitCode.externalService,
  GitHubError: ExitCode.externalService,
  RepoGone: ExitCode.externalService,
  RateLimited: ExitCode.externalService,
  CatalogMismatch: ExitCode.outdated
}

export const exitCodeForError = (error: string): ExitCode =>
  exitCodeByError[error] ?? ExitCode.failure

export const notSignedIn = (message: string) =>
  new CliFailure({ message, code: ExitCode.notSignedIn })

export const usage = (message: string) =>
  new CliFailure({ message, code: ExitCode.usage })

export const unreachable = (message: string) =>
  new CliFailure({ message, code: ExitCode.unreachable })
