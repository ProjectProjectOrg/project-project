import { Org } from "@pp/access/roles"
import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import { member, organization } from "@pp/db/schema"
import { GitHubHost } from "@pp/integration-github/Host"
import { BetterAuth } from "@pp/server-core/auth/BetterAuth"
import {
  Forbidden,
  GitHubError,
  GitHubTokenExpired,
  NotFound,
  OrgRole
} from "@pp/shared"
import { and, eq, isNull } from "drizzle-orm"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

export const GitHubHostLive = Layer.effect(
  GitHubHost,
  Effect.gen(function* () {
    const auth = yield* BetterAuth
    const db = yield* Db
    const decodeOrgRole = Schema.decodeUnknownEffect(OrgRole)
    const publicBaseUrl = Config.String("BETTER_AUTH_URL").pipe(
      Config.withDefault("http://localhost:5173")
    )
    const configError = new GitHubError({
      message: "missing GitHub App configuration"
    })
    const requireInstallPermission = Effect.fn(
      "GitHubHost.requireInstallPermission"
    )(function* (organizationId: string, userId: string) {
      const [installer] = yield* db
        .select({ role: member.role })
        .from(member)
        .innerJoin(organization, eq(member.organizationId, organization.id))
        .where(
          and(
            eq(member.organizationId, organizationId),
            eq(member.userId, userId),
            isNull(organization.deletedAt)
          )
        )
        .limit(1)
        .pipe(Effect.orDie)
      const role = installer
        ? yield* decodeOrgRole(installer.role).pipe(Effect.orDie)
        : null
      if (
        role === null ||
        !Org.orgRoles[role].can({ integration: ["manage"] })
      ) {
        return yield* new Forbidden()
      }
    })
    const installationRedirect = Effect.fn("GitHubHost.installationRedirect")(
      function* (organizationId: string, projectId: string | null) {
        const org = yield* db.query.organization
          .findFirst({
            columns: { slug: true },
            where: {
              RAW: (table, _operators) =>
                _operators.eq(table.id, organizationId)
            }
          })
          .pipe(Effect.orDie)
        if (!org) return yield* new NotFound()
        const project =
          projectId == null
            ? null
            : yield* db.query.projectIndex
                .findFirst({
                  columns: { slug: true },
                  where: {
                    RAW: (table, _operators) =>
                      _operators.and(
                        _operators.eq(table.id, projectId),
                        _operators.eq(table.organizationId, organizationId),
                        publishedProject(table)
                      )!
                  }
                })
                .pipe(Effect.orDie)
        const baseUrl = yield* publicBaseUrl.pipe(
          Effect.mapError(() => configError)
        )
        const redirectUrl = project
          ? `${baseUrl}/orgs/${org.slug}/projects/${project.slug}?githubInstall=success`
          : `${baseUrl}/orgs/${org.slug}/settings/integrations?githubInstall=success`
        return redirectUrl
      }
    )
    return GitHubHost.of({
      requireInstallPermission,
      installationRedirect,
      installationProject: (organizationId, slug) =>
        db.query.projectIndex
          .findFirst({
            columns: { id: true, organizationId: true },
            where: {
              RAW: (table, operators) =>
                operators.and(
                  operators.eq(table.organizationId, organizationId),
                  operators.eq(table.slug, slug),
                  publishedProject(table)
                )!
            }
          })
          .pipe(
            Effect.orDie,
            Effect.map((project) => project ?? null)
          ),
      userAccessToken: (userId) =>
        auth.getGithubAccessToken(userId).pipe(
          Effect.catchTag("NoGithubToken", () =>
            Effect.fail(new GitHubTokenExpired())
          ),
          Effect.catchTag("BetterAuthError", Effect.die)
        )
    })
  })
)
