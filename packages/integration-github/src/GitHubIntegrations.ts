// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash } from "node:crypto"

import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import {
  githubAppInstallSession,
  organizationGithubIntegration,
  organizationGithubIntegrationProject,
  organizationIntegration,
  projectGithubRepository,
  projectIndex,
  projectIntegrationLink
} from "@pp/db/schema"
import {
  Conflict,
  Forbidden,
  GitHubError,
  type GitHubInstallationAccount,
  type GithubInstallationChoices,
  type GithubRepoPage,
  NotFound,
  OrgScope,
  RateLimited,
  type RepoGone,
  type GithubOrgIntegrationStatus,
  type Slug,
  type StartGithubAppManifestInput,
  type StartGithubAppManifestResponse,
  type UpdateGithubInstallationInput
} from "@pp/shared"
import { and, asc, eq, gt, inArray, isNull, ne, or } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Base64Url from "effect/encoding/Base64Url"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"

import * as GitHub from "./GitHub"
import * as GitHubApps from "./GitHubApps"
import { GitHubHost } from "./Host"

export class GitHubIntegrations extends Context.Service<
  GitHubIntegrations,
  Readonly<{
    getStatus: () => Effect.Effect<GithubOrgIntegrationStatus, never, OrgScope>
    startAppManifest: (
      input: StartGithubAppManifestInput
    ) => Effect.Effect<
      StartGithubAppManifestResponse,
      NotFound | GitHubError,
      OrgScope
    >
    completeAppManifest: (
      state: string,
      code: string
    ) => Effect.Effect<
      Readonly<{ redirectUrl: string }>,
      NotFound | Forbidden | GitHubError
    >
    removeApp: (
      appId: string
    ) => Effect.Effect<GithubOrgIntegrationStatus, NotFound, OrgScope>
    updateInstallation: (
      installationId: string,
      input: UpdateGithubInstallationInput
    ) => Effect.Effect<GithubOrgIntegrationStatus, NotFound, OrgScope>
    removeInstallation: (
      installationId: string
    ) => Effect.Effect<GithubOrgIntegrationStatus, NotFound, OrgScope>
    startInstall: (
      appId: string,
      returnProjectSlug: Slug | null | undefined
    ) => Effect.Effect<
      Readonly<{ installUrl: string }>,
      NotFound | GitHubError,
      OrgScope
    >
    completeSetup: (
      state: string,
      installationId: string
    ) => Effect.Effect<
      Readonly<{ authorizeUrl: string }>,
      NotFound | GitHubError
    >
    completeCallback: (
      state: string,
      code: string
    ) => Effect.Effect<
      Readonly<{ redirectUrl: string }>,
      NotFound | Forbidden | RateLimited | GitHubError
    >
    installationChoices: (
      state: string
    ) => Effect.Effect<GithubInstallationChoices, NotFound, OrgScope>
    chooseInstallation: (
      state: string,
      installationId: string | null
    ) => Effect.Effect<
      Readonly<{ redirectUrl: string }>,
      NotFound | Forbidden | Conflict | GitHubError,
      OrgScope
    >
    listRepos: (
      installationId: string | undefined,
      query: string | undefined,
      page: number
    ) => Effect.Effect<
      GithubRepoPage,
      NotFound | RepoGone | RateLimited | GitHubError,
      OrgScope
    >
  }>
>()("@pp/integration-github/GitHubIntegrations") {}

const hashState = (state: string) =>
  createHash("sha256").update(state).digest("hex")

const encodeManifest = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

type InstallSession = typeof githubAppInstallSession.$inferSelect

const githubAuthorizeUrl = (clientId: string, state: string): string => {
  const url = new URL("https://github.com/login/oauth/authorize")
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("state", state)
  return url.toString()
}

const githubInstallUrl = (slug: string, state: string): string => {
  const url = new URL(`https://github.com/apps/${slug}/installations/new`)
  url.searchParams.set("state", state)
  return url.toString()
}

const isLocalUrl = (raw: string): boolean => {
  const { hostname } = new URL(raw)
  return hostname === "localhost" || hostname === "127.0.0.1"
}

export const appManifest = (
  organizationName: string,
  baseUrl: string,
  webhookUrl: string
) => {
  const manifest = {
    name: `ProjectProject ${organizationName}`.slice(0, 34).trim(),
    url: baseUrl,
    redirect_url: `${baseUrl}/api/integrations/github/manifest`,
    callback_urls: [`${baseUrl}/api/integrations/github/callback`],
    setup_url: `${baseUrl}/api/integrations/github/setup`,
    public: true,
    request_oauth_on_install: false,
    default_permissions: {
      metadata: "read",
      contents: "read",
      pull_requests: "read",
      checks: "read",
      statuses: "read"
    }
  }
  return isLocalUrl(webhookUrl)
    ? { ...manifest, default_events: [] }
    : {
        ...manifest,
        hook_attributes: { url: webhookUrl, active: true },
        default_events: [
          "pull_request",
          "repository",
          "delete",
          "check_suite",
          "status"
        ]
      }
}

const make = Effect.gen(function* () {
  const db = yield* Db
  const crypto = yield* Crypto.Crypto
  const sql = yield* SqlClient.SqlClient
  const github = yield* GitHub.GitHub
  const apps = yield* GitHubApps.GitHubApps
  const host = yield* GitHubHost

  const installationRows = (organizationId: string) =>
    db
      .select({
        id: organizationIntegration.id,
        appId: organizationGithubIntegration.githubAppId,
        status: organizationIntegration.status,
        lastCheckedAt: organizationIntegration.lastCheckedAt,
        lastCheckError: organizationIntegration.lastCheckError,
        installationId: organizationGithubIntegration.installationId,
        accountLogin: organizationGithubIntegration.githubAccountLogin,
        accountType: organizationGithubIntegration.githubAccountType,
        projectAccess: organizationGithubIntegration.projectAccess
      })
      .from(organizationIntegration)
      .innerJoin(
        organizationGithubIntegration,
        eq(
          organizationGithubIntegration.organizationIntegrationId,
          organizationIntegration.id
        )
      )
      .where(
        and(
          eq(organizationIntegration.organizationId, organizationId),
          eq(organizationIntegration.provider, "github"),
          inArray(organizationIntegration.status, ["active", "broken"])
        )
      )
      .orderBy(asc(organizationIntegration.connectedAt))
      .pipe(Effect.orDie)

  const statusOf = Effect.fn("GitHubIntegrations.statusOf")(function* (
    organizationId: string
  ): Effect.fn.Return<GithubOrgIntegrationStatus> {
    const [appRows, rows, allowed] = yield* Effect.all(
      [
        apps.list(organizationId),
        installationRows(organizationId),
        db
          .select({
            integrationId:
              organizationGithubIntegrationProject.organizationIntegrationId,
            slug: projectIndex.slug
          })
          .from(organizationGithubIntegrationProject)
          .innerJoin(
            projectIndex,
            eq(projectIndex.id, organizationGithubIntegrationProject.projectId)
          )
          .where(eq(projectIndex.organizationId, organizationId))
          .orderBy(asc(projectIndex.slug))
          .pipe(Effect.orDie)
      ],
      { concurrency: 3 }
    )
    return {
      status:
        rows.length === 0
          ? "not_connected"
          : rows.some((row) => row.status === "active")
            ? "active"
            : "broken",
      apps: appRows,
      installations: rows.map((row) => ({
        id: row.id,
        appId: row.appId,
        status: row.status === "active" ? "active" : "broken",
        accountLogin: row.accountLogin,
        accountType: row.accountType,
        projectAccess: row.projectAccess,
        projectSlugs: allowed.flatMap((project) =>
          project.integrationId === row.id ? [project.slug] : []
        ),
        lastCheckedAt: row.lastCheckedAt,
        lastCheckError: row.lastCheckError
      }))
    }
  })

  const getStatus = Effect.fn("GitHubIntegrations.getStatus")(function* () {
    const org = yield* OrgScope
    return yield* statusOf(org.organizationId)
  })

  const createSession = Effect.fn("GitHubIntegrations.createSession")(
    function* (
      appId: string | null,
      returnProjectSlug: Slug | null | undefined
    ): Effect.fn.Return<string, NotFound, OrgScope> {
      const org = yield* OrgScope
      const returnProject =
        returnProjectSlug == null
          ? null
          : yield* host.installationProject(
              org.organizationId,
              returnProjectSlug
            )
      if (returnProjectSlug != null && !returnProject) {
        return yield* new NotFound()
      }
      const state = Base64Url.encode(
        yield* crypto.randomBytes(32).pipe(Effect.orDie)
      )
      const now = yield* DateTime.now
      const expiresAt = DateTime.toDate(DateTime.add(now, { minutes: 10 }))
      yield* db
        .insert(githubAppInstallSession)
        .values({
          organizationId: org.organizationId,
          userId: org.userId,
          githubAppId: appId,
          returnProjectId: returnProject?.id ?? null,
          returnProjectOrgId: returnProject?.organizationId ?? null,
          stateHash: hashState(state),
          expiresAt
        })
        .pipe(Effect.orDie)
      return state
    }
  )

  const startAppManifest = Effect.fn("GitHubIntegrations.startAppManifest")(
    function* (input: StartGithubAppManifestInput) {
      const org = yield* OrgScope
      const baseUrl = yield* host.publicBaseUrl()
      const webhookUrl = yield* host.webhookUrl()
      const state = yield* createSession(null, input.returnProjectSlug)
      const action = new URL("https://github.com/settings/apps/new")
      action.searchParams.set("state", state)
      return {
        action: action.toString(),
        manifest: encodeManifest(appManifest(org.orgSlug, baseUrl, webhookUrl))
      }
    }
  )

  const sessionForState = (
    state: string
  ): Effect.Effect<InstallSession, NotFound> =>
    Effect.gen(function* () {
      const now = yield* DateTime.nowAsDate
      const session = yield* db.query.githubAppInstallSession
        .findFirst({
          where: {
            RAW: (table, _operators) =>
              _operators.eq(table.stateHash, hashState(state))
          }
        })
        .pipe(Effect.orDie)
      if (!session || session.completedAt || session.expiresAt < now) {
        return yield* new NotFound()
      }
      return session
    })

  const sessionApp = (session: InstallSession) =>
    Effect.gen(function* () {
      const app =
        session.githubAppId === null
          ? null
          : yield* apps.find(session.organizationId, session.githubAppId)
      if (!app) return yield* new NotFound()
      return app
    })

  const completeAppManifest = Effect.fn(
    "GitHubIntegrations.completeAppManifest"
  )(function* (state: string, code: string) {
    const session = yield* sessionForState(state)
    if (session.githubAppId !== null) return yield* new NotFound()
    yield* host.requireInstallPermission(session.organizationId, session.userId)
    const converted = yield* github.convertAppManifest(code)
    const app = yield* apps.create(session.organizationId, converted)
    const now = yield* DateTime.nowAsDate
    yield* db
      .update(githubAppInstallSession)
      .set({ githubAppId: app.id })
      .where(
        and(
          eq(githubAppInstallSession.id, session.id),
          isNull(githubAppInstallSession.completedAt),
          isNull(githubAppInstallSession.githubAppId),
          gt(githubAppInstallSession.expiresAt, now)
        )
      )
      .returning({ id: githubAppInstallSession.id })
      .pipe(
        Effect.orDie,
        Effect.flatMap((rows) =>
          rows[0] ? Effect.void : Effect.fail(new NotFound())
        )
      )
    return { redirectUrl: githubInstallUrl(app.slug, state) }
  })

  const startInstall = Effect.fn("GitHubIntegrations.startInstall")(function* (
    appId: string,
    returnProjectSlug: Slug | null | undefined
  ) {
    const org = yield* OrgScope
    const app = yield* apps.find(org.organizationId, appId)
    if (!app) return yield* new NotFound()
    const state = yield* createSession(app.id, returnProjectSlug)
    return { installUrl: githubAuthorizeUrl(app.clientId, state) }
  })

  const completeSetup = Effect.fn("GitHubIntegrations.completeSetup")(
    function* (
      state: string,
      installationId: string
    ): Effect.fn.Return<
      Readonly<{ authorizeUrl: string }>,
      NotFound | GitHubError
    > {
      const session = yield* sessionForState(state)
      const app = yield* sessionApp(session)
      const now = yield* DateTime.nowAsDate
      yield* db
        .update(githubAppInstallSession)
        .set({ installationId })
        .where(
          and(
            eq(githubAppInstallSession.id, session.id),
            isNull(githubAppInstallSession.completedAt),
            gt(githubAppInstallSession.expiresAt, now),
            or(
              isNull(githubAppInstallSession.installationId),
              eq(githubAppInstallSession.installationId, installationId)
            )
          )
        )
        .returning({ id: githubAppInstallSession.id })
        .pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows[0] ? Effect.void : Effect.fail(new NotFound())
          )
        )
      return { authorizeUrl: githubAuthorizeUrl(app.clientId, state) }
    }
  )

  const installationsConnectedElsewhere = (
    organizationId: string,
    installationIds: ReadonlyArray<string>
  ) =>
    installationIds.length === 0
      ? Effect.succeed(new Set<string>())
      : db
          .select({
            installationId: organizationGithubIntegration.installationId
          })
          .from(organizationGithubIntegration)
          .innerJoin(
            organizationIntegration,
            eq(
              organizationIntegration.id,
              organizationGithubIntegration.organizationIntegrationId
            )
          )
          .where(
            and(
              inArray(
                organizationGithubIntegration.installationId,
                installationIds
              ),
              ne(organizationIntegration.organizationId, organizationId)
            )
          )
          .pipe(
            Effect.orDie,
            Effect.map((rows) => new Set(rows.map((row) => row.installationId)))
          )

  const connectInstallation = (
    session: InstallSession,
    appId: string,
    account: GitHubInstallationAccount
  ): Effect.Effect<
    Readonly<{ redirectUrl: string }>,
    NotFound | Forbidden | GitHubError
  > =>
    Effect.gen(function* () {
      yield* sql
        .withTransaction(
          Effect.gen(function* () {
            const now = yield* DateTime.nowAsDate
            yield* host.requireInstallPermission(
              session.organizationId,
              session.userId
            )
            const elsewhere = yield* installationsConnectedElsewhere(
              session.organizationId,
              [account.installationId]
            )
            if (elsewhere.has(account.installationId)) {
              return yield* new Forbidden()
            }

            const [claimed] = yield* db
              .update(githubAppInstallSession)
              .set({
                completedAt: now,
                installationId: account.installationId
              })
              .where(
                and(
                  eq(githubAppInstallSession.id, session.id),
                  isNull(githubAppInstallSession.completedAt),
                  gt(githubAppInstallSession.expiresAt, now),
                  or(
                    isNull(githubAppInstallSession.installationId),
                    eq(
                      githubAppInstallSession.installationId,
                      account.installationId
                    )
                  )
                )
              )
              .returning({ id: githubAppInstallSession.id })
              .pipe(Effect.orDie)
            if (!claimed) return yield* new NotFound()

            const [existing] = yield* db
              .select({
                id: organizationGithubIntegration.organizationIntegrationId
              })
              .from(organizationGithubIntegration)
              .where(
                eq(
                  organizationGithubIntegration.installationId,
                  account.installationId
                )
              )
              .limit(1)
              .pipe(Effect.orDie)
            const github = {
              githubAppId: appId,
              installationId: account.installationId,
              githubAccountId: account.accountId,
              githubAccountLogin: account.accountLogin,
              githubAccountType: account.accountType
            }
            if (existing) {
              yield* db
                .update(organizationIntegration)
                .set({
                  status: "active",
                  disconnectedAt: null,
                  lastCheckedAt: now,
                  lastCheckStatus: "ok",
                  lastCheckError: null,
                  updatedAt: now
                })
                .where(eq(organizationIntegration.id, existing.id))
                .pipe(Effect.orDie)
              yield* db
                .update(organizationGithubIntegration)
                .set(github)
                .where(
                  eq(
                    organizationGithubIntegration.organizationIntegrationId,
                    existing.id
                  )
                )
                .pipe(Effect.orDie)
              return undefined
            }
            const [created] = yield* db
              .insert(organizationIntegration)
              .values({
                organizationId: session.organizationId,
                provider: "github",
                status: "active",
                lastCheckedAt: now,
                lastCheckStatus: "ok"
              })
              .returning()
              .pipe(Effect.orDie)
            yield* db
              .insert(organizationGithubIntegration)
              .values({ organizationIntegrationId: created.id, ...github })
              .pipe(Effect.orDie)
            return undefined
          })
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))

      const redirectUrl = yield* host.installationRedirect(
        session.organizationId,
        session.returnProjectId
      )
      return { redirectUrl }
    })

  const completeCallback = Effect.fn("GitHubIntegrations.completeCallback")(
    function* (
      state: string,
      code: string
    ): Effect.fn.Return<
      Readonly<{ redirectUrl: string }>,
      NotFound | Forbidden | RateLimited | GitHubError
    > {
      const session = yield* sessionForState(state)
      const app = yield* sessionApp(session)
      const userToken = yield* github.exchangeAppUserCode(app.id, code)
      const installations = yield* github.listAppUserInstallations(userToken)
      const installationId = session.installationId
      if (installationId) {
        const canAccess = installations.some(
          (installation) => installation.installationId === installationId
        )
        if (!canAccess) return yield* new Forbidden()
        const account = yield* github
          .getInstallationAccount(app.id, installationId)
          .pipe(
            Effect.catchTag("RepoGone", () =>
              Effect.fail(
                new GitHubError({ message: "installation not found" })
              )
            )
          )
        return yield* connectInstallation(session, app.id, account)
      }
      if (installations.length === 0) {
        return { redirectUrl: githubInstallUrl(app.slug, state) }
      }
      const now = yield* DateTime.nowAsDate
      yield* db
        .update(githubAppInstallSession)
        .set({ candidateInstallations: installations })
        .where(
          and(
            eq(githubAppInstallSession.id, session.id),
            isNull(githubAppInstallSession.completedAt),
            isNull(githubAppInstallSession.installationId),
            gt(githubAppInstallSession.expiresAt, now)
          )
        )
        .returning({ id: githubAppInstallSession.id })
        .pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows[0] ? Effect.void : Effect.fail(new NotFound())
          )
        )
      return {
        redirectUrl: yield* host.installationChoiceRedirect(
          session.organizationId,
          state
        )
      }
    }
  )

  const choiceSession = (state: string) =>
    Effect.gen(function* () {
      const org = yield* OrgScope
      const session = yield* sessionForState(state)
      if (
        session.organizationId !== org.organizationId ||
        session.userId !== org.userId ||
        session.installationId !== null ||
        session.candidateInstallations === null
      ) {
        return yield* new NotFound()
      }
      const app = yield* sessionApp(session)
      return { session, app, candidates: session.candidateInstallations }
    })

  const installationChoices = Effect.fn(
    "GitHubIntegrations.installationChoices"
  )(function* (
    state: string
  ): Effect.fn.Return<GithubInstallationChoices, NotFound, OrgScope> {
    const { session, candidates } = yield* choiceSession(state)
    const elsewhere = yield* installationsConnectedElsewhere(
      session.organizationId,
      candidates.map((candidate) => candidate.installationId)
    )
    return {
      installations: candidates.map((candidate) => ({
        installationId: candidate.installationId,
        accountLogin: candidate.accountLogin,
        accountType: candidate.accountType,
        connectedElsewhere: elsewhere.has(candidate.installationId)
      }))
    }
  })

  const chooseInstallation = Effect.fn("GitHubIntegrations.chooseInstallation")(
    function* (
      state: string,
      installationId: string | null
    ): Effect.fn.Return<
      Readonly<{ redirectUrl: string }>,
      NotFound | Forbidden | Conflict | GitHubError,
      OrgScope
    > {
      const { session, app, candidates } = yield* choiceSession(state)
      if (installationId === null) {
        return { redirectUrl: githubInstallUrl(app.slug, state) }
      }
      const account = candidates.find(
        (candidate) => candidate.installationId === installationId
      )
      if (!account) return yield* new NotFound()
      const elsewhere = yield* installationsConnectedElsewhere(
        session.organizationId,
        [installationId]
      )
      if (elsewhere.has(installationId)) {
        return yield* new Conflict({
          reason: "installation_connected_elsewhere"
        })
      }
      return yield* connectInstallation(session, app.id, account)
    }
  )

  const disconnectInstallations = (integrationIds: ReadonlyArray<string>) =>
    integrationIds.length === 0
      ? Effect.void
      : sql
          .withTransaction(
            Effect.gen(function* () {
              const now = yield* DateTime.nowAsDate
              yield* db
                .update(organizationIntegration)
                .set({
                  status: "disconnected",
                  disconnectedAt: now,
                  updatedAt: now
                })
                .where(inArray(organizationIntegration.id, [...integrationIds]))
                .pipe(Effect.orDie)
              const links = yield* db
                .update(projectIntegrationLink)
                .set({
                  status: "disconnected",
                  disconnectedAt: now,
                  updatedAt: now
                })
                .where(
                  and(
                    eq(projectIntegrationLink.provider, "github"),
                    inArray(projectIntegrationLink.status, [
                      "active",
                      "broken"
                    ]),
                    inArray(projectIntegrationLink.organizationIntegrationId, [
                      ...integrationIds
                    ])
                  )
                )
                .returning({ id: projectIntegrationLink.id })
                .pipe(Effect.orDie)
              yield* links.length === 0
                ? Effect.void
                : db
                    .update(projectGithubRepository)
                    .set({ status: "disconnected" })
                    .where(
                      inArray(
                        projectGithubRepository.projectIntegrationLinkId,
                        links.map((link) => link.id)
                      )
                    )
                    .pipe(Effect.orDie)
              yield* db
                .delete(organizationGithubIntegration)
                .where(
                  inArray(
                    organizationGithubIntegration.organizationIntegrationId,
                    [...integrationIds]
                  )
                )
                .pipe(Effect.orDie)
            })
          )
          .pipe(Effect.catchTag("SqlError", Effect.die))

  const removeInstallation = Effect.fn("GitHubIntegrations.removeInstallation")(
    function* (installationId: string) {
      const org = yield* OrgScope
      const rows = yield* installationRows(org.organizationId)
      if (!rows.some((row) => row.id === installationId)) {
        return yield* new NotFound()
      }
      yield* disconnectInstallations([installationId])
      return yield* statusOf(org.organizationId)
    }
  )

  const removeApp = Effect.fn("GitHubIntegrations.removeApp")(function* (
    appId: string
  ) {
    const org = yield* OrgScope
    const app = yield* apps.find(org.organizationId, appId)
    if (!app) return yield* new NotFound()
    const rows = yield* installationRows(org.organizationId)
    yield* disconnectInstallations(
      rows.flatMap((row) => (row.appId === app.id ? [row.id] : []))
    )
    yield* apps.remove(app.id)
    return yield* statusOf(org.organizationId)
  })

  const updateInstallation = Effect.fn("GitHubIntegrations.updateInstallation")(
    function* (installationId: string, input: UpdateGithubInstallationInput) {
      const org = yield* OrgScope
      const rows = yield* installationRows(org.organizationId)
      if (!rows.some((row) => row.id === installationId)) {
        return yield* new NotFound()
      }
      const projects =
        input.projectAccess === "all" || input.projectSlugs.length === 0
          ? []
          : yield* db
              .select({ id: projectIndex.id })
              .from(projectIndex)
              .where(
                and(
                  eq(projectIndex.organizationId, org.organizationId),
                  inArray(projectIndex.slug, [...input.projectSlugs]),
                  publishedProject()
                )
              )
              .pipe(Effect.orDie)
      yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* db
              .update(organizationGithubIntegration)
              .set({ projectAccess: input.projectAccess })
              .where(
                eq(
                  organizationGithubIntegration.organizationIntegrationId,
                  installationId
                )
              )
              .pipe(Effect.orDie)
            yield* db
              .delete(organizationGithubIntegrationProject)
              .where(
                eq(
                  organizationGithubIntegrationProject.organizationIntegrationId,
                  installationId
                )
              )
              .pipe(Effect.orDie)
            yield* projects.length === 0
              ? Effect.void
              : db
                  .insert(organizationGithubIntegrationProject)
                  .values(
                    projects.map((project) => ({
                      organizationIntegrationId: installationId,
                      projectId: project.id
                    }))
                  )
                  .pipe(Effect.orDie)
          })
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))
      return yield* statusOf(org.organizationId)
    }
  )

  const listRepos = Effect.fn("GitHubIntegrations.listRepos")(function* (
    installationId: string | undefined,
    query: string | undefined,
    page: number
  ) {
    const org = yield* OrgScope
    const rows = yield* installationRows(org.organizationId)
    const integration = rows.find(
      (row) =>
        row.status === "active" &&
        (installationId === undefined || row.id === installationId)
    )
    if (!integration) return yield* new NotFound()
    return yield* github.listInstallationRepos(
      integration.installationId,
      query,
      page
    )
  })

  return GitHubIntegrations.of({
    getStatus,
    startAppManifest,
    completeAppManifest,
    removeApp,
    updateInstallation,
    removeInstallation,
    startInstall,
    completeSetup,
    completeCallback,
    installationChoices,
    chooseInstallation,
    listRepos
  })
})

export const layer = Layer.effect(GitHubIntegrations, make)
