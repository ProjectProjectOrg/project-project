import {
  CreatableProjectKey,
  Slug,
  type JiraMigrationDestinationConflict
} from "@pp/shared"
import * as Schema from "effect/Schema"

import { m } from "@/paraglide/messages"

export type DestinationField = "name" | "slug" | "key"

const LISTED_TICKETS = 3

type Conflicts = ReadonlyArray<JiraMigrationDestinationConflict>

const valuesOf = (
  conflicts: Conflicts,
  kind: JiraMigrationDestinationConflict["kind"]
) =>
  conflicts.flatMap((conflict) =>
    conflict.kind === kind ? [conflict.value] : []
  )

const ticketMessage = (tickets: ReadonlyArray<string>): string | null =>
  tickets.length === 0
    ? null
    : m.jira_import_conflict_tickets({
        count: tickets.length,
        keys:
          tickets.length > LISTED_TICKETS
            ? m.jira_import_review_more({
                list: tickets.slice(0, LISTED_TICKETS).join(", "),
                count: tickets.length - LISTED_TICKETS
              })
            : tickets.join(", ")
      })

export const conflictMessages = (conflicts: Conflicts): ReadonlyArray<string> =>
  [
    ...valuesOf(conflicts, "project_slug").map((value) =>
      m.jira_import_conflict_slug({ value })
    ),
    ...valuesOf(conflicts, "project_key").map((value) =>
      m.jira_import_conflict_key({ value })
    ),
    valuesOf(conflicts, "project_key").length > 0
      ? null
      : ticketMessage(valuesOf(conflicts, "ticket_id"))
  ].filter((message): message is string => message !== null)

export const conflictFor = (
  field: DestinationField,
  conflicts: Conflicts
): string | null => {
  if (field === "name") return null
  const messages = conflictMessages(
    conflicts.filter(
      (conflict) => (conflict.kind === "project_slug") === (field === "slug")
    )
  )
  return messages.length === 0 ? null : messages.join(" ")
}

export const destinationFieldSchemas = {
  name: Schema.toStandardSchemaV1(
    Schema.String.check(
      Schema.makeFilter((value: string) => value.trim().length > 0)
    )
  ),
  slug: Schema.toStandardSchemaV1(Slug),
  key: Schema.toStandardSchemaV1(CreatableProjectKey)
} as const

export const conflictingFields = (conflicts: Conflicts): number =>
  (["slug", "key"] as const).filter(
    (field) => conflictFor(field, conflicts) !== null
  ).length
