import type { JiraError } from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type {
  JiraPublicationPlanV1,
  JiraPreparedPublicationV1
} from "./PublicationPlan"

type SealedSecret = Readonly<{ ciphertext: string; nonce: string; tag: string }>

export class JiraHost extends Context.Service<
  JiraHost,
  Readonly<{
    seal: (plaintext: string) => Effect.Effect<SealedSecret, JiraError>
    open: (sealed: SealedSecret) => Effect.Effect<string, JiraError>
  }>
>()("@pp/server-core/jira/Host/JiraHost") {}

type PlannedComment = JiraPublicationPlanV1["comments"][number]
type PlannedAttachment = JiraPreparedPublicationV1["attachments"][number]

export class JiraPublicationFormat extends Context.Service<
  JiraPublicationFormat,
  Readonly<{
    serializeCommentsRegion: (
      comments: ReadonlyArray<
        Pick<PlannedComment, "id" | "author" | "body"> &
          Readonly<{
            origin: "native" | "jira"
            createdAt: Date
            editedAt: Date | null
          }>
      >
    ) => string
    attachmentObjectKey: (
      input: Pick<PlannedAttachment, "filename"> &
        Readonly<{
          ticketId: string
          attachmentId: PlannedAttachment["id"]
          keyPrefix: string | null
          orgSlug: string
          projectSlug: string
        }>
    ) => string
  }>
>()("@pp/server-core/jira/Host/JiraPublicationFormat") {}
