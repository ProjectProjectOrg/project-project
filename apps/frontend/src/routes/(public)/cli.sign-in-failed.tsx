import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import { CliSignInFailedPage } from "@/features/oauth/components/CliSignInPage"

const CliSignInFailedSearch = Schema.Struct({
  reason: Schema.optional(Schema.String)
})

export const Route = createFileRoute("/(public)/cli/sign-in-failed")({
  component: CliSignInFailedPage,
  validateSearch: Schema.toStandardSchemaV1(CliSignInFailedSearch)
})
