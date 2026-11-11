import { Db } from "@pp/db"
import {
  organizationGithubApp,
  organizationGithubIntegration,
  organizationIntegration
} from "@pp/db/schema"
import { GitHubError, type GithubApp } from "@pp/shared"
import { and, asc, eq, isNull } from "drizzle-orm"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"

import { appAuth, type GitHubAppAuth } from "./appAuth"
import { GitHubHost } from "./Host"

export type GitHubAppRow = Readonly<{
  id: string
  organizationId: string
  githubAppId: string
  slug: string
  name: string
  clientId: string
}>

export type NewGitHubApp = Readonly<{
  githubAppId: string
  slug: string
  name: string
  ownerLogin: string | null
  clientId: string
  privateKey: string
  clientSecret: string
  webhookSecret: string
}>

export type GitHubAppWebhookSecret = Readonly<{
  githubAppId: string
  secret: string
}>

const AppSecrets = Schema.fromJsonString(
  Schema.Struct({
    privateKey: Schema.String,
    clientSecret: Schema.String,
    webhookSecret: Schema.String
  })
)
const encodeSecrets = Schema.encodeSync(AppSecrets)
const decodeSecrets = Schema.decodeUnknownEffect(AppSecrets)

const unknownApp = new GitHubError({ message: "GitHub App not found" })

export class GitHubApps extends Context.Service<
  GitHubApps,
  Readonly<{
    list: (organizationId: string) => Effect.Effect<ReadonlyArray<GithubApp>>
    find: (
      organizationId: string,
      appId: string
    ) => Effect.Effect<GitHubAppRow | null>
    byId: (appId: string) => Effect.Effect<GitHubAppRow | null>
    create: (
      organizationId: string,
      app: NewGitHubApp
    ) => Effect.Effect<GitHubAppRow, GitHubError>
    remove: (appId: string) => Effect.Effect<void>
    auth: (appId: string) => Effect.Effect<GitHubAppAuth, GitHubError>
    authForInstallation: (
      installationId: string
    ) => Effect.Effect<GitHubAppAuth, GitHubError>
    webhookSecrets: (
      githubAppId: string | null
    ) => Effect.Effect<ReadonlyArray<GitHubAppWebhookSecret>>
    installationOwner: (installationId: string) => Effect.Effect<string | null>
  }>
>()("@pp/integration-github/GitHubApps") {}

const rowColumns = {
  id: organizationGithubApp.id,
  organizationId: organizationGithubApp.organizationId,
  githubAppId: organizationGithubApp.githubAppId,
  slug: organizationGithubApp.slug,
  name: organizationGithubApp.name,
  clientId: organizationGithubApp.clientId
}

const slugFromInstallUrl = (raw: string | undefined): string | null =>
  raw === undefined ? null : (/\/apps\/([^/?#]+)/.exec(raw)?.[1] ?? null)

const make = Effect.gen(function* () {
  const db = yield* Db
  const host = yield* GitHubHost
  const auths = new Map<string, GitHubAppAuth>()

  const list = Effect.fn("GitHubApps.list")(function* (organizationId: string) {
    return yield* db
      .select({
        id: organizationGithubApp.id,
        githubAppId: organizationGithubApp.githubAppId,
        name: organizationGithubApp.name,
        slug: organizationGithubApp.slug,
        ownerLogin: organizationGithubApp.ownerLogin,
        createdAt: organizationGithubApp.createdAt
      })
      .from(organizationGithubApp)
      .where(eq(organizationGithubApp.organizationId, organizationId))
      .orderBy(asc(organizationGithubApp.createdAt))
      .pipe(Effect.orDie)
  })

  const find = Effect.fn("GitHubApps.find")(function* (
    organizationId: string,
    appId: string
  ) {
    return yield* db
      .select(rowColumns)
      .from(organizationGithubApp)
      .where(
        and(
          eq(organizationGithubApp.organizationId, organizationId),
          eq(organizationGithubApp.id, appId)
        )
      )
      .limit(1)
      .pipe(
        Effect.map((rows) => rows[0] ?? null),
        Effect.orDie
      )
  })

  const byId = Effect.fn("GitHubApps.byId")(function* (appId: string) {
    return yield* db
      .select(rowColumns)
      .from(organizationGithubApp)
      .where(eq(organizationGithubApp.id, appId))
      .limit(1)
      .pipe(
        Effect.map((rows) => rows[0] ?? null),
        Effect.orDie
      )
  })

  const create = Effect.fn("GitHubApps.create")(function* (
    organizationId: string,
    app: NewGitHubApp
  ) {
    const sealed = yield* host.seal(
      encodeSecrets({
        privateKey: app.privateKey,
        clientSecret: app.clientSecret,
        webhookSecret: app.webhookSecret
      })
    )
    const values = {
      slug: app.slug,
      name: app.name,
      ownerLogin: app.ownerLogin,
      clientId: app.clientId,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      tag: sealed.tag
    }
    const [row] = yield* db
      .insert(organizationGithubApp)
      .values({ organizationId, githubAppId: app.githubAppId, ...values })
      .onConflictDoUpdate({
        target: [
          organizationGithubApp.organizationId,
          organizationGithubApp.githubAppId
        ],
        set: values
      })
      .returning(rowColumns)
      .pipe(Effect.orDie)
    auths.delete(row.id)
    return row
  })

  const remove = Effect.fn("GitHubApps.remove")(function* (appId: string) {
    yield* db
      .delete(organizationGithubApp)
      .where(eq(organizationGithubApp.id, appId))
      .pipe(Effect.orDie)
    auths.delete(appId)
  })

  const secretsOf = (
    row: Readonly<{ ciphertext: string; nonce: string; tag: string }>
  ) =>
    host
      .open({ ciphertext: row.ciphertext, nonce: row.nonce, tag: row.tag })
      .pipe(
        Effect.flatMap(decodeSecrets),
        Effect.mapError(
          () => new GitHubError({ message: "GitHub App secrets unreadable" })
        )
      )

  const auth = Effect.fn("GitHubApps.auth")(function* (appId: string) {
    const cached = auths.get(appId)
    if (cached) return cached
    const [row] = yield* db
      .select()
      .from(organizationGithubApp)
      .where(eq(organizationGithubApp.id, appId))
      .limit(1)
      .pipe(Effect.orDie)
    if (!row) return yield* unknownApp
    const secrets = yield* secretsOf(row)
    const created = yield* appAuth({
      githubAppId: row.githubAppId,
      privateKey: secrets.privateKey,
      clientId: row.clientId,
      clientSecret: secrets.clientSecret
    })
    auths.set(appId, created)
    return created
  })

  const authForInstallation = Effect.fn("GitHubApps.authForInstallation")(
    function* (installationId: string) {
      const [row] = yield* db
        .select({ appId: organizationGithubIntegration.githubAppId })
        .from(organizationGithubIntegration)
        .where(eq(organizationGithubIntegration.installationId, installationId))
        .limit(1)
        .pipe(Effect.orDie)
      if (!row?.appId) return yield* unknownApp
      return yield* auth(row.appId)
    }
  )

  const webhookSecrets = Effect.fn("GitHubApps.webhookSecrets")(function* (
    githubAppId: string | null
  ) {
    const rows = yield* db
      .select()
      .from(organizationGithubApp)
      .where(
        githubAppId === null
          ? undefined
          : eq(organizationGithubApp.githubAppId, githubAppId)
      )
      .pipe(Effect.orDie)
    const secrets = yield* Effect.forEach(rows, (row) =>
      secretsOf(row).pipe(
        Effect.map(
          (secret): ReadonlyArray<GitHubAppWebhookSecret> => [
            { githubAppId: row.githubAppId, secret: secret.webhookSecret }
          ]
        ),
        Effect.orElseSucceed((): ReadonlyArray<GitHubAppWebhookSecret> => [])
      )
    )
    return secrets.flat()
  })

  const installationOwner = Effect.fn("GitHubApps.installationOwner")(
    function* (installationId: string) {
      const [row] = yield* db
        .select({ githubAppId: organizationGithubApp.githubAppId })
        .from(organizationGithubIntegration)
        .innerJoin(
          organizationGithubApp,
          eq(
            organizationGithubApp.id,
            organizationGithubIntegration.githubAppId
          )
        )
        .where(eq(organizationGithubIntegration.installationId, installationId))
        .limit(1)
        .pipe(Effect.orDie)
      return row?.githubAppId ?? null
    }
  )

  const importFromEnvironment = Effect.gen(function* () {
    const env = yield* Config.all({
      githubAppId: Config.String("GITHUB_APP_ID"),
      privateKey: Config.Redacted("GITHUB_APP_PRIVATE_KEY"),
      clientId: Config.String("GITHUB_APP_CLIENT_ID"),
      clientSecret: Config.Redacted("GITHUB_APP_CLIENT_SECRET"),
      webhookSecret: Config.Redacted("GITHUB_APP_WEBHOOK_SECRET"),
      installUrl: Config.option(Config.String("GITHUB_APP_INSTALL_URL"))
    }).pipe(Effect.option)
    if (Option.isNone(env) || env.value.githubAppId.length === 0) return
    const pending = yield* db
      .selectDistinct({
        organizationId: organizationIntegration.organizationId
      })
      .from(organizationGithubIntegration)
      .innerJoin(
        organizationIntegration,
        eq(
          organizationIntegration.id,
          organizationGithubIntegration.organizationIntegrationId
        )
      )
      .where(isNull(organizationGithubIntegration.githubAppId))
      .pipe(Effect.orDie)
    const slug =
      slugFromInstallUrl(Option.getOrUndefined(env.value.installUrl)) ??
      `app-${env.value.githubAppId}`
    yield* Effect.forEach(
      pending,
      ({ organizationId }) =>
        Effect.gen(function* () {
          const app = yield* create(organizationId, {
            githubAppId: env.value.githubAppId,
            slug,
            name: slug,
            ownerLogin: null,
            clientId: env.value.clientId,
            privateKey: Redacted.value(env.value.privateKey),
            clientSecret: Redacted.value(env.value.clientSecret),
            webhookSecret: Redacted.value(env.value.webhookSecret)
          })
          const installations = yield* db
            .select({ id: organizationIntegration.id })
            .from(organizationIntegration)
            .where(
              and(
                eq(organizationIntegration.organizationId, organizationId),
                eq(organizationIntegration.provider, "github")
              )
            )
            .pipe(Effect.orDie)
          yield* Effect.forEach(installations, (installation) =>
            db
              .update(organizationGithubIntegration)
              .set({ githubAppId: app.id })
              .where(
                and(
                  eq(
                    organizationGithubIntegration.organizationIntegrationId,
                    installation.id
                  ),
                  isNull(organizationGithubIntegration.githubAppId)
                )
              )
              .pipe(Effect.orDie)
          )
          yield* Effect.logInfo("imported GitHub App from environment").pipe(
            Effect.annotateLogs({
              organizationId,
              githubAppId: app.githubAppId
            })
          )
        }),
      { discard: true }
    )
  })

  yield* importFromEnvironment.pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("GitHub App environment import failed", cause)
    )
  )

  return GitHubApps.of({
    list,
    find,
    byId,
    create,
    remove,
    auth,
    authForInstallation,
    webhookSecrets,
    installationOwner
  })
})

export const layer = Layer.effect(GitHubApps, make)
