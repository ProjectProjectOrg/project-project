import { createFileRoute, redirect } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

const ProfileSearch = Schema.Struct({
  error: Schema.optional(Schema.NonEmptyString),
  figmaError: Schema.optional(Schema.NonEmptyString)
})

export const Route = createFileRoute("/_authed/profile/")({
  validateSearch: Schema.toStandardSchemaV1(ProfileSearch),
  beforeLoad: ({ search }) => {
    if (search.error || search.figmaError) {
      throw redirect({ to: "/profile/connections", search, replace: true })
    }
    throw redirect({ to: "/profile/account", replace: true })
  }
})
