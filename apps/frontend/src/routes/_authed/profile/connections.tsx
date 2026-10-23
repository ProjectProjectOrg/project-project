import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import { Connections } from "@/features/profile/components/Connections"
import { m } from "@/paraglide/messages"

const ConnectionsSearch = Schema.Struct({
  error: Schema.optional(Schema.NonEmptyString),
  figmaError: Schema.optional(Schema.NonEmptyString),
  slackError: Schema.optional(Schema.NonEmptyString)
})

export const Route = createFileRoute("/_authed/profile/connections")({
  component: Connections,
  validateSearch: Schema.toStandardSchemaV1(ConnectionsSearch),
  loader: () => ({
    crumb: {
      type: "static" as const,
      label: m.profile_section_connections_title()
    }
  })
})
