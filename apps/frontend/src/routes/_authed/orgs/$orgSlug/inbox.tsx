import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import { InboxPage } from "@/features/inbox/components/InboxPage"
import { m } from "@/paraglide/messages"

const InboxSearchSchema = Schema.Struct({
  ticket: Schema.optional(Schema.String)
})

export const Route = createFileRoute("/_authed/orgs/$orgSlug/inbox")({
  component: InboxPage,
  validateSearch: Schema.toStandardSchemaV1(InboxSearchSchema),
  loader: () => ({
    crumb: { type: "static" as const, label: m.inbox_title() }
  })
})
