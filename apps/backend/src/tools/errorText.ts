import { BetterAuthError } from "@pp/server-core/auth/BetterAuth"
import {
  GroupIdTaken,
  MarkdownError,
  TicketIdTaken
} from "@pp/server-core/markdown/Markdown"
import {
  AttachmentNotUploaded,
  BranchExists,
  BranchProtected,
  type ToolError,
  ToolErrors,
  toolErrorText,
  ToolFailure
} from "@pp/shared"
import * as Match from "effect/Match"
import * as Schema from "effect/Schema"

const BackendToolError = Schema.Union([
  AttachmentNotUploaded,
  BetterAuthError,
  BranchExists,
  BranchProtected,
  Schema.instanceOf(GroupIdTaken),
  Schema.instanceOf(MarkdownError),
  Schema.instanceOf(Schema.SchemaError),
  Schema.instanceOf(TicketIdTaken)
])
type BackendToolError = typeof BackendToolError.Type
const isBackendError = Schema.is(BackendToolError)
const isToolError = Schema.is(Schema.Union(ToolErrors))

type Messages<E extends { readonly _tag: string }> = {
  readonly [K in E["_tag"]]: (error: Extract<E, { readonly _tag: K }>) => string
}

const backendMessages: Messages<BackendToolError> = {
  SchemaError: (error) => `Validation error: ${error.message}`,
  MarkdownError: () => "Document read failed.",
  BetterAuthError: () => "Auth provider error.",
  TicketIdTaken: () => "Identifier already taken.",
  GroupIdTaken: () => "Identifier already taken.",
  AttachmentNotUploaded: () =>
    "AttachmentNotUploaded: The uploaded object could not be verified. Retry the POST to uploadUrl. If the upload URL expired, prepare a new upload.",
  BranchExists: ({ branch }) =>
    branch ? `Branch already exists: ${branch}.` : "Branch already exists.",
  BranchProtected: () => "Branch is protected."
}

const backendMessage = Match.typeTags<BackendToolError>()(backendMessages)

export const toolFailureOf = Match.type<unknown>().pipe(
  Match.when(
    isToolError,
    (error: ToolError) =>
      new ToolFailure({ error: error._tag, message: toolErrorText(error) })
  ),
  Match.when(
    isBackendError,
    (error) =>
      new ToolFailure({ error: error._tag, message: backendMessage(error) })
  ),
  Match.orElse(() => undefined)
)

export const toolErrorMessage = (error: unknown): string | undefined =>
  toolFailureOf(error)?.message
