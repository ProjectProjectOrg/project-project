import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import { LoginPage } from "@/features/auth/components/LoginPage"

const LoginSearch = Schema.Struct({
  redirect: Schema.optional(Schema.String)
})

export const Route = createFileRoute("/(public)/login")({
  component: LoginPage,
  validateSearch: Schema.toStandardSchemaV1(LoginSearch)
})
