import * as Schema from "effect/Schema"

import { isJiraUnavailableDetail } from "@/lib/errorMessage"

type TaggedError = Readonly<{ _tag: string }>

const isReconnectRequired = Schema.is(
  Schema.TaggedStruct("JiraReconnectRequired", {})
)
const isNotConnected = Schema.is(Schema.TaggedStruct("JiraNotConnected", {}))
const isRevisionConflictDetail = Schema.is(
  Schema.TaggedStruct("Conflict", {
    reason: Schema.Literals([
      "jira_migration_revision_conflict",
      "jira_migration_request_conflict"
    ])
  })
)

export const isJiraStorageUnavailable = (error: TaggedError): boolean =>
  isJiraUnavailableDetail(error) && error.reason === "storage_unavailable"

export const isJiraReconnectError = (error: TaggedError): boolean =>
  isReconnectRequired(error) || isNotConnected(error)

export const isRevisionConflict = (error: TaggedError): boolean =>
  isRevisionConflictDetail(error)
