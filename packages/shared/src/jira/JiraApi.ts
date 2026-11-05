import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import * as Schema from "effect/Schema"

import { OrgAccess, RequiresOrg } from "../access/OrgAccess"
import { Authentication } from "../auth/Authentication"
import {
  Conflict,
  Forbidden,
  JiraAccessDenied,
  JiraError,
  JiraMigrationUnavailable,
  JiraNotConnected,
  JiraRateLimited,
  JiraReconnectRequired,
  JiraResourceNotFound,
  NotFound,
  Unauthorized,
  Validation
} from "../errors"
import { OrgPath } from "../http/paths"
import { Slug } from "../projects/Project"
import {
  ConfigureJiraMigrationInput,
  CreateJiraMigrationInput,
  JiraConnection,
  JiraMigrationDestinationConflict,
  JiraMigrationDetail,
  JiraMigrationRevisionInput,
  JiraMigrationSummary,
  JiraProjectChoice,
  JiraSite,
  JiraSkippedAttachment
} from "./JiraMigration"

const JiraErrors = [
  Unauthorized,
  JiraNotConnected,
  JiraReconnectRequired,
  JiraAccessDenied,
  JiraRateLimited,
  JiraError
] as const

export const JiraGroup = HttpApiGroup.make("jira")
  .add(
    HttpApiEndpoint.get("profile", "/integrations/jira/profile", {
      success: JiraConnection,
      error: Unauthorized
    })
  )
  .add(
    HttpApiEndpoint.delete("disconnectProfile", "/integrations/jira/profile", {
      success: JiraConnection,
      error: Unauthorized
    })
  )
  .add(
    HttpApiEndpoint.get("sites", "/integrations/jira/sites", {
      success: Schema.Array(JiraSite),
      error: JiraErrors
    })
  )
  .add(
    HttpApiEndpoint.get(
      "projects",
      "/integrations/jira/sites/:cloudId/projects",
      {
        params: Schema.Struct({ cloudId: Schema.String }),
        success: Schema.Array(JiraProjectChoice),
        error: [...JiraErrors, JiraResourceNotFound]
      }
    )
  )
  .middleware(Authentication)

const JiraMigrationPath = Schema.Struct({
  orgSlug: Slug,
  migrationId: Schema.NonEmptyString
})

const JiraMigrationReadErrors = [
  Unauthorized,
  NotFound,
  Forbidden,
  JiraError,
  JiraMigrationUnavailable
] as const

const JiraMigrationWriteErrors = [
  ...JiraMigrationReadErrors,
  Validation,
  Conflict,
  JiraNotConnected,
  JiraReconnectRequired,
  JiraAccessDenied,
  JiraResourceNotFound,
  JiraRateLimited,
  JiraError
] as const

const JiraMigrationAcceptedDetail = JiraMigrationDetail.pipe(
  HttpApiSchema.status(202)
)

export const JiraMigrationsGroup = HttpApiGroup.make("jiraMigrations")
  .add(
    HttpApiEndpoint.get("list", "/orgs/:orgSlug/jira-migrations", {
      params: OrgPath,
      success: Schema.Array(JiraMigrationSummary),
      error: JiraMigrationReadErrors
    })
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("create", "/orgs/:orgSlug/jira-migrations", {
      params: OrgPath,
      payload: CreateJiraMigrationInput,
      success: JiraMigrationAcceptedDetail,
      error: JiraMigrationWriteErrors
    })
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get("get", "/orgs/:orgSlug/jira-migrations/:migrationId", {
      params: JiraMigrationPath,
      success: JiraMigrationDetail,
      error: JiraMigrationReadErrors
    })
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "destinationConflicts",
      "/orgs/:orgSlug/jira-migrations/:migrationId/destination-conflicts",
      {
        params: JiraMigrationPath,
        query: Schema.Struct({
          expectedRevision: Schema.FiniteFromString.pipe(
            Schema.check(Schema.isInt()),
            Schema.check(Schema.isGreaterThanOrEqualTo(0))
          )
        }),
        success: Schema.Array(JiraMigrationDestinationConflict),
        error: JiraMigrationWriteErrors
      }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "skippedAttachments",
      "/orgs/:orgSlug/jira-migrations/:migrationId/skipped-attachments",
      {
        params: JiraMigrationPath,
        success: Schema.Array(JiraSkippedAttachment),
        error: JiraMigrationReadErrors
      }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "rescan",
      "/orgs/:orgSlug/jira-migrations/:migrationId/rescan",
      {
        params: JiraMigrationPath,
        payload: JiraMigrationRevisionInput,
        success: JiraMigrationAcceptedDetail,
        error: JiraMigrationWriteErrors
      }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.put(
      "configure",
      "/orgs/:orgSlug/jira-migrations/:migrationId/configuration",
      {
        params: JiraMigrationPath,
        payload: ConfigureJiraMigrationInput,
        success: JiraMigrationDetail,
        error: JiraMigrationWriteErrors
      }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "run",
      "/orgs/:orgSlug/jira-migrations/:migrationId/run",
      {
        params: JiraMigrationPath,
        payload: JiraMigrationRevisionInput,
        success: JiraMigrationAcceptedDetail,
        error: JiraMigrationWriteErrors
      }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "cancel",
      "/orgs/:orgSlug/jira-migrations/:migrationId/cancel",
      {
        params: JiraMigrationPath,
        payload: JiraMigrationRevisionInput,
        success: JiraMigrationAcceptedDetail,
        error: JiraMigrationWriteErrors
      }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "discard",
      "/orgs/:orgSlug/jira-migrations/:migrationId",
      {
        params: JiraMigrationPath,
        success: HttpApiSchema.NoContent,
        error: JiraMigrationWriteErrors
      }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .middleware(Authentication)
