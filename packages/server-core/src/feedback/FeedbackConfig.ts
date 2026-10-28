import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

export const DEFAULT_FEEDBACK_TARGET_URL = "https://projectproject.missler.xyz"

export type FeedbackConfigShape = Readonly<{
  targetUrl: Option.Option<string>
  instanceUrl: string
  version: Option.Option<string>
  intake: Option.Option<
    Readonly<{
      orgSlug: string
      projectName: string
      projectKey: string
    }>
  >
  trustedProxyHops: number
}>

const feedbackConfig = Config.all({
  sendingEnabled: Config.Boolean("FEEDBACK_SENDING_ENABLED").pipe(
    Config.withDefault(true)
  ),
  targetUrl: Config.String("FEEDBACK_TARGET_URL").pipe(
    Config.withDefault(DEFAULT_FEEDBACK_TARGET_URL)
  ),
  instanceUrl: Config.String("BETTER_AUTH_URL").pipe(
    Config.withDefault("http://localhost:5173")
  ),
  version: Config.String("APP_VERSION").pipe(Config.option),
  intakeEnabled: Config.Boolean("FEEDBACK_INTAKE_ENABLED").pipe(
    Config.withDefault(false)
  ),
  intakeOrg: Config.String("FEEDBACK_INTAKE_ORG").pipe(
    Config.orElse(() => Config.String("BOOTSTRAP_ORG_SLUG")),
    Config.option
  ),
  projectName: Config.String("FEEDBACK_INTAKE_PROJECT_NAME").pipe(
    Config.withDefault("Feedback & bug reports")
  ),
  projectKey: Config.String("FEEDBACK_INTAKE_PROJECT_KEY").pipe(
    Config.withDefault("FB")
  ),
  trustedProxyHops: Config.Int("TRUSTED_PROXY_HOPS").pipe(Config.withDefault(1))
})

export class FeedbackConfig extends Context.Service<
  FeedbackConfig,
  FeedbackConfigShape
>()("@pp/server-core/feedback/FeedbackConfig") {
  static readonly layer = Layer.effect(
    FeedbackConfig,
    Effect.gen(function* () {
      const config = yield* feedbackConfig
      const intake = config.intakeEnabled
        ? Option.map(config.intakeOrg, (orgSlug) => ({
            orgSlug,
            projectName: config.projectName,
            projectKey: config.projectKey
          }))
        : Option.none()
      if (config.intakeEnabled && Option.isNone(intake)) {
        yield* Effect.logWarning(
          "FEEDBACK_INTAKE_ENABLED is set but no FEEDBACK_INTAKE_ORG or BOOTSTRAP_ORG_SLUG; intake stays off"
        )
      }
      return {
        targetUrl: config.sendingEnabled
          ? Option.some(config.targetUrl)
          : Option.none(),
        instanceUrl: config.instanceUrl,
        version: config.version,
        intake,
        trustedProxyHops: config.trustedProxyHops
      } satisfies FeedbackConfigShape
    }).pipe(Effect.orDie)
  )
}
