import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import { OauthConsentPage } from "@/features/oauth/components/OauthConsentPage"

const OauthConsentSearch = Schema.Struct({
  client_id: Schema.optional(Schema.String),
  scope: Schema.optional(Schema.String)
})

export const Route = createFileRoute("/(public)/oauth/consent")({
  component: OauthConsentPage,
  validateSearch: Schema.toStandardSchemaV1(OauthConsentSearch)
})
