import { JiraMigrationUnavailable } from "@pp/shared"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"

type TaggedError = Readonly<{ _tag: string }>

const isUnavailable = Schema.is(Schema.Struct(JiraMigrationUnavailable.fields))

export const isJiraStorageUnavailable = (error: TaggedError) =>
  isUnavailable(error) && error.reason === "storage_unavailable"

export const isJiraReconnectError = (error: TaggedError) =>
  Predicate.isTagged(error, "JiraReconnectRequired") ||
  Predicate.isTagged(error, "JiraNotConnected")

export const isRevisionConflict = (error: TaggedError) =>
  Predicate.isTagged(error, "JiraMigrationChanged")
