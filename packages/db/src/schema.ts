// THE DATABASE SCHEMA, AS TYPESCRIPT.
// ============================================================================
// drizzle-orm lets you describe Postgres tables as TypeScript values. The
// shape you write here drives three things:
//
//   1. The *generated SQL migrations* (`drizzle-kit generate` reads this file
//      and emits SQL into `src/db/migrations/`).
//   2. The *runtime types* of `db.select().from(projectIndex)` — Drizzle
//      infers what columns each row has, so a row from `projectIndex` is
//      `{ slug: string, ownerId: string, createdAt: Date }` in TypeScript.
//   3. The *insert/update/select APIs* — `db.insert(projectIndex).values({...})`
//      type-checks against this definition.
//
// IMPORTANT — what we put here, and what we don't.
// ----------------------------------------------------------------------------
// `docs/PROJECTPROJECT.md` is opinionated about this:
//
//   > Postgres holds only what *has* to be in a database: identity, sessions,
//   > and a thin index for fast project lookup. Everything else is markdown.
//
// So we declare *only* the `project_index` table here. There will be no
// `tickets` table, no `members` table, no `comments` table. Those live in
// markdown frontmatter.
//
// In Chapter 2 we'll let Better Auth's drizzle adapter add its own tables
// (users, sessions, accounts, verification_tokens) — those will appear in
// this same schema file via `import` of Better Auth's helpers, alongside the
// hand-written `projectIndex`.
//
// CHAPTER 1 GOAL
// ----------------------------------------------------------------------------
// Define `projectIndex` with three columns:
//
//   slug         text, primary key
//   ownerId      text, not null  — references users.id once Chapter 2 adds it
//   createdAt    timestamp, not null, defaults to now()
//
// Then run `bun run db:generate` to produce the first migration, and
// `bun run db:migrate` to apply it against the running Postgres.

import type {
  GitAutomationEvent,
  GitHubInstallationAccount,
  ProjectEvent,
  ProjectEventKind,
  SlackNotification,
  FeedbackReport,
  JiraMigrationConfiguration,
  OrgEverhourConfig,
  ProjectBanner,
  ProjectIconImage,
  TicketActivityChangeEncoded
} from "@pp/shared"
import { defineRelations, sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  integer,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core"

export * from "./auth-schema"
import { invitation, member, organization, user } from "./auth-schema"
import * as authSchema from "./auth-schema"

export type OrgIntegrationConfig = OrgEverhourConfig | Record<string, never>

export const projectIndex = pgTable(
  "project_index",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade"
      }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull(),
    banner: jsonb("banner").$type<ProjectBanner>(),
    iconImage: jsonb("icon_image").$type<ProjectIconImage>(),
    estimation: text("estimation", {
      enum: ["off", "points", "tshirt", "time"]
    })
      .notNull()
      .default("off"),
    nextTicketNumber: integer("next_ticket_number").notNull().default(1),
    gitAutomationForwardOnly: boolean("git_automation_forward_only")
      .notNull()
      .default(true),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow()
  },
  (table) => [
    unique("project_index_id_organization_uidx").on(
      table.id,
      table.organizationId
    ),
    uniqueIndex("project_index_organization_key_uidx").on(
      table.organizationId,
      table.key
    ),
    uniqueIndex("project_index_organization_slug_uidx").on(
      table.organizationId,
      table.slug
    )
  ]
)

export const projectRole = pgTable(
  "project_role",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade"
    }),
    name: text("name").notNull(),
    permissions: jsonb("permissions"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    check(
      "project_role_permissions_check",
      sql`(${table.organizationId} is null) = (${table.permissions} is null)`
    )
  ]
)

export const projectMember = pgTable(
  "project_member",
  {
    projectId: uuid("project_id").notNull(),
    organizationId: text("organization_id").notNull(),
    userId: text("user_id").notNull(),
    roleId: text("role_id")
      .notNull()
      .references(() => projectRole.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    foreignKey({
      name: "project_member_project_fkey",
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projectIndex.id, projectIndex.organizationId]
    }).onDelete("cascade"),
    foreignKey({
      name: "project_member_org_member_fkey",
      columns: [table.organizationId, table.userId],
      foreignColumns: [member.organizationId, member.userId]
    }).onDelete("cascade"),
    index("project_member_user_idx").on(table.userId),
    index("project_member_org_user_idx").on(table.organizationId, table.userId)
  ]
)

export const projectInviteGrant = pgTable(
  "project_invite_grant",
  {
    invitationId: text("invitation_id")
      .notNull()
      .references(() => invitation.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectIndex.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => projectRole.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.invitationId, table.projectId] }),
    index("project_invite_grant_project_idx").on(table.projectId)
  ]
)

export const projectTag = pgTable(
  "project_tag",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectIndex.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.name] }),
    index("project_tag_project_idx").on(t.projectId)
  ]
)

export const projectStatus = pgTable(
  "project_status",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectIndex.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull(),
    orderKey: text("order_key").notNull(),
    description: text("description"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.slug] }),
    index("project_status_project_idx").on(t.projectId),
    index("project_status_order_idx").on(t.projectId, t.orderKey)
  ]
)

export const projectGitAutomation = pgTable(
  "project_git_automation",
  {
    projectId: uuid("project_id").notNull(),
    event: text("event").$type<GitAutomationEvent>().notNull(),
    statusSlug: text("status_slug").notNull()
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.event] }),
    foreignKey({
      name: "project_git_automation_status_fkey",
      columns: [t.projectId, t.statusSlug],
      foreignColumns: [projectStatus.projectId, projectStatus.slug]
    })
      .onDelete("cascade")
      .onUpdate("cascade")
  ]
)

export const organizationIntegration = pgTable(
  "organization_integration",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text("provider", {
      enum: ["github", "everhour", "s3", "figma", "slack"]
    }).notNull(),
    status: text("status", {
      enum: ["active", "disconnected", "broken"]
    }).notNull(),
    config: jsonb("config").$type<OrgIntegrationConfig>(),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastCheckStatus: text("last_check_status", { enum: ["ok", "error"] }),
    lastCheckError: text("last_check_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => [
    unique("organization_integration_id_org_uidx").on(t.id, t.organizationId),
    uniqueIndex("organization_integration_active_provider_uidx")
      .on(t.organizationId, t.provider)
      .where(sql`${t.status} = 'active' and ${t.provider} <> 'github'`),
    index("organization_integration_org_idx").on(t.organizationId)
  ]
)

export const organizationGithubApp = pgTable(
  "organization_github_app",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    githubAppId: text("github_app_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ownerLogin: text("owner_login"),
    clientId: text("client_id").notNull(),
    ciphertext: text("ciphertext").notNull(),
    nonce: text("nonce").notNull(),
    tag: text("tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => [
    uniqueIndex("organization_github_app_org_app_uidx").on(
      t.organizationId,
      t.githubAppId
    ),
    index("organization_github_app_github_app_idx").on(t.githubAppId)
  ]
)

export const organizationGithubIntegration = pgTable(
  "organization_github_integration",
  {
    organizationIntegrationId: uuid("organization_integration_id")
      .primaryKey()
      .references(() => organizationIntegration.id, { onDelete: "cascade" }),
    githubAppId: uuid("github_app_id").references(
      () => organizationGithubApp.id,
      { onDelete: "cascade" }
    ),
    projectAccess: text("project_access", { enum: ["all", "selected"] })
      .notNull()
      .default("all"),
    installationId: text("installation_id").notNull(),
    githubAccountId: text("github_account_id").notNull(),
    githubAccountLogin: text("github_account_login").notNull(),
    githubAccountType: text("github_account_type", {
      enum: ["User", "Organization"]
    }).notNull()
  },
  (t) => [
    uniqueIndex("organization_github_integration_installation_uidx").on(
      t.installationId
    ),
    index("organization_github_integration_app_idx").on(t.githubAppId)
  ]
)

export const organizationGithubIntegrationProject = pgTable(
  "organization_github_integration_project",
  {
    organizationIntegrationId: uuid("organization_integration_id")
      .notNull()
      .references(
        () => organizationGithubIntegration.organizationIntegrationId,
        {
          onDelete: "cascade"
        }
      ),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectIndex.id, { onDelete: "cascade" })
  },
  (t) => [
    primaryKey({ columns: [t.organizationIntegrationId, t.projectId] }),
    index("organization_github_integration_project_project_idx").on(t.projectId)
  ]
)

export const organizationEmail = pgTable("organization_email", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  revision: uuid("revision").notNull().defaultRandom(),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  security: text("security").$type<"tls" | "starttls">().notNull(),
  username: text("username").notNull(),
  senderName: text("sender_name").notNull(),
  senderEmail: text("sender_email").notNull(),
  replyTo: text("reply_to"),
  ciphertext: text("ciphertext").notNull(),
  nonce: text("nonce").notNull(),
  tag: text("tag").notNull(),
  lastTestAt: timestamp("last_test_at", { withTimezone: true }),
  lastTestError:
    text("last_test_error").$type<import("@pp/shared").EmailFailureReason>()
})

export const organizationS3Integration = pgTable(
  "organization_s3_integration",
  {
    organizationIntegrationId: uuid("organization_integration_id")
      .primaryKey()
      .references(() => organizationIntegration.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    bucket: text("bucket").notNull(),
    region: text("region").notNull(),
    keyPrefix: text("key_prefix"),
    forcePathStyle: boolean("force_path_style").notNull().default(true),
    accessKeyId: text("access_key_id").notNull(),
    encryptedSecretKey: text("encrypted_secret_key").notNull(),
    secretKeyNonce: text("secret_key_nonce").notNull(),
    secretKeyTag: text("secret_key_tag").notNull()
  }
)

export const githubAppInstallSession = pgTable(
  "github_app_install_session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    githubAppId: uuid("github_app_id").references(
      () => organizationGithubApp.id,
      { onDelete: "cascade" }
    ),
    returnProjectId: uuid("return_project_id"),
    returnProjectOrgId: text("return_project_org_id"),
    stateHash: text("state_hash").notNull().unique(),
    installationId: text("installation_id"),
    candidateInstallations: jsonb("candidate_installations").$type<
      ReadonlyArray<GitHubInstallationAccount>
    >(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => [
    foreignKey({
      name: "github_app_install_session_return_project_fkey",
      columns: [t.returnProjectId, t.returnProjectOrgId],
      foreignColumns: [projectIndex.id, projectIndex.organizationId]
    }).onDelete("set null"),
    index("github_app_install_session_org_idx").on(t.organizationId)
  ]
)

export const projectIntegrationLink = pgTable(
  "project_integration_link",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    organizationIntegrationId: uuid("organization_integration_id").notNull(),
    provider: text("provider", {
      enum: ["github", "everhour", "figma", "slack"]
    }).notNull(),
    status: text("status", {
      enum: ["active", "disconnected", "broken"]
    }).notNull(),
    subscribedEvents: jsonb("subscribed_events")
      .$type<ReadonlyArray<ProjectEventKind>>()
      .notNull()
      .default([]),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastCheckStatus: text("last_check_status", { enum: ["ok", "error"] }),
    lastCheckError: text("last_check_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => [
    unique("project_integration_link_id_org_uidx").on(t.id, t.organizationId),
    foreignKey({
      name: "project_integration_link_project_id_organization_id_fkey",
      columns: [t.projectId, t.organizationId],
      foreignColumns: [projectIndex.id, projectIndex.organizationId]
    }).onDelete("cascade"),
    foreignKey({
      name: "project_integration_link_org_integration_id_organization_id_fke",
      columns: [t.organizationIntegrationId, t.organizationId],
      foreignColumns: [
        organizationIntegration.id,
        organizationIntegration.organizationId
      ]
    }).onDelete("cascade"),
    uniqueIndex("project_integration_link_active_provider_uidx")
      .on(t.projectId, t.provider)
      .where(sql`${t.status} = 'active' and ${t.provider} <> 'github'`),
    index("project_integration_link_project_idx").on(t.projectId),
    index("project_integration_link_org_integration_idx").on(
      t.organizationIntegrationId
    )
  ]
)

export const projectGithubRepository = pgTable(
  "project_github_repository",
  {
    projectIntegrationLinkId: uuid("project_integration_link_id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["active", "disconnected", "broken"]
    }).notNull(),
    repoId: text("repo_id").notNull(),
    repoOwner: text("repo_owner").notNull(),
    repoName: text("repo_name").notNull(),
    defaultBranch: text("default_branch").notNull()
  },
  (t) => [
    foreignKey({
      name: "project_github_repository_link_id_organization_id_fkey",
      columns: [t.projectIntegrationLinkId, t.organizationId],
      foreignColumns: [
        projectIntegrationLink.id,
        projectIntegrationLink.organizationId
      ]
    }).onDelete("cascade"),
    uniqueIndex("project_github_repository_active_repo_uidx")
      .on(t.organizationId, t.repoId)
      .where(sql`${t.status} = 'active'`)
  ]
)

export const githubPullRequestReconciliation = pgTable(
  "github_pull_request_reconciliation",
  {
    repositoryId: text("repository_id").notNull(),
    number: integer("number").notNull(),
    payloadHash: text("payload_hash").notNull().default(""),
    branch: text("branch").notNull(),
    base: text("base").notNull(),
    state: text("state", { enum: ["open", "closed", "merged"] }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    mergedAt: timestamp("merged_at", { withTimezone: true })
  },
  (t) => [
    primaryKey({ columns: [t.repositoryId, t.number] }),
    index("github_pr_reconciliation_branch_idx").on(t.repositoryId, t.branch)
  ]
)

export const userEverhourIntegration = pgTable("user_everhour_integration", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  encryptedApiKey: text("encrypted_api_key").notNull(),
  apiKeyNonce: text("api_key_nonce").notNull(),
  apiKeyTag: text("api_key_tag").notNull(),
  everhourUserId: text("everhour_user_id").notNull(),
  name: text("name"),
  email: text("email"),
  connectedAt: timestamp("connected_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  lastCheckStatus: text("last_check_status", { enum: ["ok", "error"] }),
  lastCheckError: text("last_check_error")
})

export const projectEverhourIntegration = pgTable(
  "project_everhour_integration",
  {
    projectIntegrationLinkId: uuid("project_integration_link_id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["active", "disconnected", "broken"]
    }).notNull(),
    everhourProjectId: text("everhour_project_id").notNull(),
    everhourProjectName: text("everhour_project_name").notNull(),
    backlogSectionId: text("backlog_section_id"),
    webhookId: text("webhook_id"),
    webhookSecret: text("webhook_secret"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncStatus: text("last_sync_status", { enum: ["ok", "error"] }),
    lastSyncError: text("last_sync_error"),
    lastSyncActorUserId: text("last_sync_actor_user_id"),
    syncRequestedAt: timestamp("sync_requested_at", { withTimezone: true }),
    syncClaimedUntil: timestamp("sync_claimed_until", { withTimezone: true }),
    syncRetryAt: timestamp("sync_retry_at", { withTimezone: true })
  },
  (t) => [
    foreignKey({
      name: "project_everhour_integration_link_id_organization_id_fkey",
      columns: [t.projectIntegrationLinkId, t.organizationId],
      foreignColumns: [
        projectIntegrationLink.id,
        projectIntegrationLink.organizationId
      ]
    }).onDelete("cascade"),
    uniqueIndex("project_everhour_integration_active_project_uidx")
      .on(t.organizationId, t.everhourProjectId)
      .where(sql`${t.status} = 'active'`),
    index("project_everhour_integration_sync_requested_idx")
      .on(t.syncRequestedAt)
      .where(sql`${t.syncRequestedAt} is not null`)
  ]
)

export const everhourSectionLink = pgTable(
  "everhour_section_link",
  {
    projectIntegrationLinkId: uuid("project_integration_link_id").notNull(),
    localKey: text("local_key").notNull(),
    groupId: text("group_id"),
    everhourSectionId: text("everhour_section_id").notNull(),
    name: text("name").notNull(),
    status: text("status", {
      enum: ["active", "archived", "broken"]
    }).notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
  },
  (t) => [
    primaryKey({ columns: [t.projectIntegrationLinkId, t.localKey] }),
    foreignKey({
      name: "everhour_section_link_project_link_fkey",
      columns: [t.projectIntegrationLinkId],
      foreignColumns: [projectIntegrationLink.id]
    }).onDelete("cascade")
  ]
)

export const everhourWorkTypeTaskLink = pgTable(
  "everhour_work_type_task_link",
  {
    projectIntegrationLinkId: uuid("project_integration_link_id").notNull(),
    groupId: text("group_id").notNull(),
    workTypeKey: text("work_type_key").notNull(),
    everhourTaskId: text("everhour_task_id").notNull(),
    name: text("name").notNull(),
    status: text("status", {
      enum: ["active", "archived", "broken"]
    }).notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
  },
  (t) => [
    primaryKey({
      columns: [t.projectIntegrationLinkId, t.groupId, t.workTypeKey]
    }),
    foreignKey({
      name: "everhour_work_type_task_link_project_link_fkey",
      columns: [t.projectIntegrationLinkId],
      foreignColumns: [projectIntegrationLink.id]
    }).onDelete("cascade")
  ]
)

export const everhourActiveTimer = pgTable(
  "everhour_active_timer",
  {
    everhourUserId: text("everhour_user_id").primaryKey(),
    userId: text("user_id").notNull(),
    projectIntegrationLinkId: uuid("project_integration_link_id").notNull(),
    ticketId: text("ticket_id"),
    groupId: text("group_id").notNull(),
    workTypeKey: text("work_type_key").notNull(),
    everhourTaskId: text("everhour_task_id").notNull(),
    everhourTimerId: text("everhour_timer_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull()
  },
  (t) => [
    foreignKey({
      name: "everhour_active_timer_project_link_fkey",
      columns: [t.projectIntegrationLinkId],
      foreignColumns: [projectIntegrationLink.id]
    }).onDelete("cascade"),
    index("everhour_active_timer_user_idx").on(t.userId)
  ]
)

export const everhourTimeAttribution = pgTable(
  "everhour_time_attribution",
  {
    everhourEntryId: text("everhour_entry_id").primaryKey(),
    everhourTimeId: text("everhour_time_id").notNull(),
    projectIntegrationLinkId: uuid("project_integration_link_id").notNull(),
    ticketId: text("ticket_id"),
    groupId: text("group_id").notNull(),
    workTypeKey: text("work_type_key").notNull(),
    everhourUserId: text("everhour_user_id").notNull(),
    userId: text("user_id").notNull(),
    seconds: integer("seconds").notNull(),
    date: text("date").notNull(),
    origin: text("origin", { enum: ["pp", "everhour"] })
      .notNull()
      .default("pp"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (t) => [
    foreignKey({
      name: "everhour_time_attribution_project_link_fkey",
      columns: [t.projectIntegrationLinkId],
      foreignColumns: [projectIntegrationLink.id]
    }).onDelete("cascade"),
    index("everhour_time_attribution_ticket_idx").on(
      t.projectIntegrationLinkId,
      t.ticketId
    ),
    index("everhour_time_attribution_time_idx").on(t.everhourTimeId)
  ]
)

export const ticketIndex = pgTable(
  "ticket_index",
  {
    organizationId: text("organization_id").notNull(),
    projectId: uuid("project_id").notNull(),
    ticketId: text("ticket_id").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull(),
    type: text("type", {
      enum: ["feat", "bug", "chore", "other", "epic"]
    }).notNull(),
    priority: text("priority", {
      enum: ["low", "med", "high"]
    }).notNull(),
    estimateUnit: text("estimate_unit", {
      enum: ["points", "tshirt", "time"]
    }),
    estimateValue: integer("estimate_value"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    assignees: text("assignees")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    parent: text("parent"),
    movedFrom: text("moved_from")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    repoId: text("repo_id"),
