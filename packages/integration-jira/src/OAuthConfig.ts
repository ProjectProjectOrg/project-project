import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"

export class JiraOAuthConfig extends Context.Service<
  JiraOAuthConfig,
  Readonly<{
    clientId: string
    clientSecret: Redacted.Redacted
    publicBaseUrl: string
    authorizationEndpoint?: string
  }>
>()("@pp/integration-jira/OAuthConfig/JiraOAuthConfig") {}

const make = Effect.all({
  clientId: Config.String("JIRA_CLIENT_ID").pipe(Config.withDefault("")),
  clientSecret: Config.Redacted("JIRA_CLIENT_SECRET").pipe(
    Config.withDefault(Redacted.make(""))
  ),
  publicBaseUrl: Config.String("BETTER_AUTH_URL").pipe(
    Config.withDefault("http://localhost:5173")
  )
})

export const layer = Layer.effect(JiraOAuthConfig, make)
