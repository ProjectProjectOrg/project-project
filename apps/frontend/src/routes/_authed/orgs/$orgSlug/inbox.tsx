import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import { Crumb } from "@/components/shell/crumb"
import { inboxEntries, inboxRequest } from "@/features/inbox/atoms/inbox"
import { InboxPage } from "@/features/inbox/components/InboxPage"
import { m } from "@/paraglide/messages"

const InboxSearch = Schema.Struct({
  entry: Schema.optional(Schema.String)
})

export const Route = createFileRoute("/_authed/orgs/$orgSlug/inbox")({
  component: InboxPage,
  validateSearch: Schema.toStandardSchemaV1(InboxSearch),
  loader: ({ context: { registry }, params: { orgSlug } }) => {
    registry.mount(inboxEntries(inboxRequest(orgSlug)))()
    return {
      crumb: Crumb.static({
        label: m.inbox_title(),
        to: "/orgs/$orgSlug/inbox",
        params: { orgSlug }
      })
    }
  }
})
