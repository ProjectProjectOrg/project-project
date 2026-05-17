// packages/backend/src/db/schema.ts
//
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

import { relations } from "drizzle-orm"
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core"

export * from "./auth-schema"
import { invitation, organization, user } from "./auth-schema"

export const projectIndex = pgTable(
  "project_index",
  {
    id: uuid("id").defaultRandom().notNull().unique(),
    slug: text("slug").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade"
      }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    uniqueIndex("project_index_organization_key_uidx").on(
      table.organizationId,
      table.key
    )
  ]
)

export const projectMember = pgTable(
  "project_member",
  {
    projectSlug: text("project_slug")
      .notNull()
      .references(() => projectIndex.slug, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projectIndex.id, {
      onDelete: "cascade"
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "member"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.projectSlug, table.userId] }),
    index("project_member_user_idx").on(table.userId)
  ]
)

export const projectInviteGrant = pgTable(
  "project_invite_grant",
  {
    invitationId: text("invitation_id")
      .notNull()
      .references(() => invitation.id, { onDelete: "cascade" }),
    projectSlug: text("project_slug")
      .notNull()
      .references(() => projectIndex.slug, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectIndex.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["admin", "member"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.invitationId, table.projectSlug] }),
    index("project_invite_grant_project_idx").on(table.projectSlug)
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

export const projectIndexRelations = relations(
  projectIndex,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [projectIndex.organizationId],
      references: [organization.id]
    }),
    members: many(projectMember),
    inviteGrants: many(projectInviteGrant),
    tags: many(projectTag)
  })
)

export const projectMemberRelations = relations(projectMember, ({ one }) => ({
  project: one(projectIndex, {
    fields: [projectMember.projectSlug],
    references: [projectIndex.slug]
  }),
  user: one(user, {
    fields: [projectMember.userId],
    references: [user.id]
  })
}))

export const projectInviteGrantRelations = relations(
  projectInviteGrant,
  ({ one }) => ({
    invitation: one(invitation, {
      fields: [projectInviteGrant.invitationId],
      references: [invitation.id]
    }),
    project: one(projectIndex, {
      fields: [projectInviteGrant.projectSlug],
      references: [projectIndex.slug]
    })
  })
)

export const projectTagRelations = relations(projectTag, ({ one }) => ({
  project: one(projectIndex, {
    fields: [projectTag.projectId],
    references: [projectIndex.id]
  }),
  createdByUser: one(user, {
    fields: [projectTag.createdBy],
    references: [user.id]
  })
}))

export const commentIndex = pgTable(
  "comment_index",
  {
    id: text("id").primaryKey(),
    projectSlug: text("project_slug").notNull(),
    ticketId: text("ticket_id").notNull(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true })
  },
  (t) => [
    index("comment_index_ticket_idx").on(t.projectSlug, t.ticketId, t.createdAt)
  ]
)

export const commentIndexRelations = relations(commentIndex, ({ one }) => ({
  author: one(user, {
    fields: [commentIndex.authorId],
    references: [user.id]
  })
}))
