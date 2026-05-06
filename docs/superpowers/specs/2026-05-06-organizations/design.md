# Organizations — Design

**Date:** 2026-05-06
**Status:** Approved, ready for implementation
**Spec context:** Cross-cutting; introduces multi-tenancy across the whole app.

## Goal

Turn ProjectProject into a multi-tenant SaaS. Users sign up, create or join an **organization**, and all projects live under exactly one org. Tenant isolation is real: an org is the trust boundary for billing, invitations, and access.

## Scope

In scope:

- Better Auth `organization` plugin wired up; org/member/invitation tables managed by Better Auth.
- Better Auth `admin` plugin wired up for instance-level "super-admin" role.
- New schema dimension on existing data: every project is FK-constrained to exactly one org.
- URL pattern `/orgs/:orgSlug/projects/:projectSlug/...` everywhere.
- Filesystem layout `data/orgs/<orgSlug>/projects/<projectSlug>/...`.
- Self-serve org creation as the primary onboarding flow.
- Email-based invitations (handled by Better Auth).
- Effective project role = `max(org-role-implied, explicit projectMember role)`.
- One-off migration script for existing dev data.

Out of scope (parked for explicit later phases):

- Login methods beyond GitHub (SSO / magic link / email+password). Flagged; decide pre-launch.
- Stripe billing wiring. Schema carries placeholder fields; design separately.
- Org-level GitHub App installation. v1 keeps the existing per-project per-user-token model.
- Teams as project-access groupings. v2 enhancement.
- Subdomain-per-org. v2 enhancement; v1 stays subdomain-ready (see "Subdomain readiness ledger").
- Project moves between orgs.
- Soft-deleted org restore UI for end users (super-admin only in v1).

## Decisions (the agreed pile)

1. **Multi-tenancy** is the framing — strict isolation between orgs.
2. **Better Auth `organization` plugin** for org/member/invitation tables; **`admin` plugin** for instance super-admin.
3. **Effective role composition.** `org owner` → implies project `owner` everywhere in the org. `org admin` → implies project `admin` everywhere. `org member` → no implication; explicit project membership required.
   - `effectiveProjectRole = max(implicit-from-org, explicit-projectMember)`.
   - **Constraint:** projectMember rows require an active org membership for the same `(userId, organizationId)`. Cascades on org-membership removal.
4. **No personal orgs.** Sign-up requires create-or-accept-invite. Org is the only tenant unit.
5. **Teams ≠ Projects.** Better Auth's teams construct is reserved for future "project-access grouping" use, not used for project identity.
6. **Self-serve org creation is primary.** Super-admin via Better Auth's `admin` plugin can also create orgs — for ops, support, recovery — but is not the gate.
7. **Slug uniqueness per org.** Composite UNIQUE on `(organizationId, slug)`.
8. **Filesystem layout** `data/orgs/<orgSlug>/projects/<projectSlug>/...`. Slugs permanent in v1.
9. **URL** `/orgs/:orgSlug/projects/:projectSlug/...`. URL is canonical for active org; `session.activeOrganizationId` syncs from URL. Non-membership → 404 (not 403; tenant existence is not leaked).
10. **`projectIndex` schema:** UUID `id` PK, `(organizationId, slug)` UNIQUE. `ownerId` renamed to `createdBy` and treated as audit-only — `projectMember` table is the source of truth for current ownership.
11. **`project.md` frontmatter** gains `org: <orgSlug>` field. Tickets and docs unchanged (their org is path-derivable; `username` remains globally unique so user references resolve unambiguously).
12. **Subdomain-readiness ledger.** Slug must be DNS-safe; reserved words include DNS-reserved names; cookie config and `trustedOrigins` written as functions, not hardcoded.

## Data model

### Better Auth–managed tables (added by plugin)

- `organization` — `id`, `name`, `slug`, `logo`, `metadata`, `createdAt`. **We add (via plugin's `additionalFields`):** `billingCustomerId` (nullable), `subscriptionStatus` (nullable enum-as-text), `deletedAt` (nullable timestamp).
- `member` — `id`, `organizationId`, `userId`, `role` (`owner | admin | member`), `createdAt`.
- `invitation` — `id`, `organizationId`, `email`, `role`, `status`, `expiresAt`, `inviterId`.

### Better Auth admin plugin

Adds a `role` column to `user` (instance-level: `user | admin`), plus `banned`, `banReason`, `banExpires`. Disjoint from org-level role.

### Our tables (modified)

```ts
projectIndex = pgTable("project_index", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull(),  // renamed from ownerId; audit only
  createdAt: timestamp(...).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("project_index_org_slug_idx").on(t.organizationId, t.slug),
])

projectMember = pgTable("project_member", {
  projectId: uuid("project_id")
    .notNull()
    .references(() => projectIndex.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "admin", "member"] }).notNull(),
  createdAt: timestamp(...).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.projectId, t.userId] }),
  index("project_member_user_idx").on(t.userId),
])
```

### `project.md` frontmatter

```yaml
---
slug: design-system
org: acme              # NEW
name: Design System Rewrite
createdBy: github_42   # was ownerId
members:
  - { username: wouter, role: owner }
  - { username: pm-anna, role: member }
github:
  repoOwner: woutervh
  repoName: design-system
createdAt: 2026-05-06T10:00:00Z
---
```

Tickets and docs frontmatter: no change. Their org is inferred from path; `username` references stay valid because `user.username` is globally unique.

## URL & routing

Pattern: `/orgs/:orgSlug/projects/:projectSlug/{tickets,docs,settings}/...`.

Top-level non-org routes:

- `/login` — Better Auth sign-in.
- `/onboarding` — for users with zero orgs.
- `/_admin/...` — super-admin panel.
- `/api/*` — HTTP API.
- `/api/auth/*` — Better Auth.
- `/mcp/*` — MCP server (org-scoped tokens).

`/` behavior:

- 0 orgs → redirect `/onboarding`.
- 1 org → redirect `/orgs/<slug>`.
- N orgs → render org switcher (uses `session.activeOrganizationId` as the suggested default).

`/orgs/:orgSlug` for non-member: 404. Backend resolves `(orgSlug, userId)` via `member` table; absence is indistinguishable from non-existence on the wire.

## Permissions

### Org role gates (Better Auth–native)

Standard owner/admin/member from the plugin. Used for:

- Manage org settings (rename, transfer ownership, soft-delete).
- Invite/remove org members.
- Create projects in the org.
- Connect billing.

### Project role gates (existing)

The matrix in `services/Projects.ts` is unchanged in shape — it just runs against **effective project role**:

```ts
function effectiveProjectRole(orgRole: OrgRole, projectRole: ProjectRole | null): ProjectRole {
  if (orgRole === "owner") return "owner"
  if (orgRole === "admin") return rankMax("admin", projectRole)
  return projectRole ?? throwForbidden() // org member with no explicit project membership: no access
}
```

`requireRole(userId, projectId, allowed)` becomes `requireRole(userId, orgId, projectId, allowed)` — composes both lookups, returns 404 on miss (no info leak).

UI shows implicit-via-org-role members as a separate, greyed row in the project members list ("Wouter — Owner via org role"). Demoting yourself from this row routes to "leave the org" / "lower your org role" — not "remove from project".

## Sign-up & onboarding

### Path A — fresh signup, no invite

1. User clicks "Sign in with GitHub" → Better Auth OAuth dance.
2. Post-auth: backend checks `member` table for any orgs.
3. None → redirect to `/onboarding`.
4. `/onboarding`: form for org name + slug (slug auto-suggested from name, validated DNS-safe + reserved-words). Stripe placeholder fields stubbed.
5. Submit → `auth.api.createOrganization`. User added as org `owner`. `session.activeOrganizationId` set.
6. Redirect to `/orgs/:newSlug` (empty workspace, "Create your first project" CTA).

### Path B — signup via invite

1. User receives invite email with magic link → clicks → lands on `/invite/:token`.
2. If unauthed: trigger sign-in flow (preserves the token through the OAuth round-trip).
3. Authed + token valid → `auth.api.acceptInvitation`. User added to org with the invited role.
4. Redirect to `/orgs/:orgSlug`.

### Path C — super-admin creates an org

Via `/_admin/orgs/new`: admin enters name, slug, initial-owner identity (existing user picker or invite-by-email). Submit → `auth.api.createOrganization` + add owner / send invite.

## Migration plan

One-off script at `packages/backend/scripts/migrate-orgs.ts`. Run once with `bun run migrate:orgs`, then archive.

Steps:

1. **Pre-flight check.** Schema migration must already be applied. Fail loud on any unexpected state — the script is not idempotent.
2. **Identify users.** Earliest-by-`createdAt` user = "primary" — promoted to instance super-admin (`user.role = "admin"`) and org `owner`. Other users → org `member`.
3. **Create org.** `slug = "project-project"`, `name = "ProjectProject"`. Insert `organization` row + `member` rows directly via Drizzle (Better Auth API path is fine too, but direct SQL keeps the script self-contained).
4. **Backfill `projectIndex`.** For each row: generate UUID `id`, set `organizationId = <new-org-id>`, rename `owner_id` column to `created_by` (handled by schema migration; the script just verifies).
5. **Remap `projectMember`.** For each row: replace `projectSlug` with the corresponding `projectId`. Existing `role` values preserved verbatim.
6. **Filesystem move.** `mkdir -p data/orgs/project-project && mv data/projects data/orgs/project-project/projects`.
7. **Frontmatter rewrite.** Walk every `project.md`; add `org: project-project`; rename `ownerId` → `createdBy`.
8. **Verify.** Read every project via `Markdown.readProjectFile`; assert it decodes against the new schema. Bail loud on any failure.

DB and FS aren't transactionally coupled. Order: DB first, then FS, then frontmatter. On FS failure: log, surface manual-recovery instructions, don't auto-rollback (manual `mv` is safer than auto-corruption).

## Phased rollout

1. **Schema + plugins.** Better Auth `organization` + `admin` plugins wired. Drizzle migration: add UUID `id` + `organizationId` to `projectIndex` (nullable initially), rename `owner_id` → `created_by`, add UNIQUE `(organizationId, slug)`. New `projectMember.projectId` (nullable initially). Tests for plugin wiring.
2. **Org-aware Markdown service.** Path resolution becomes `data/orgs/<orgSlug>/projects/<slug>/...`. Service signatures take an `orgSlug` everywhere.
3. **One-off migration.** Script runs against dev data. Verifies. After this, schema migration tightens nullable columns to NOT NULL.
4. **Onboarding flow.** `/onboarding` route, self-serve org creation, GitHub sign-in lands here for users with zero orgs.
5. **URL refactor.** All project routes become `/orgs/:orgSlug/projects/:projectSlug/...`. Atoms, handlers, components updated. Active-org session sync middleware.
6. **Effective-role logic.** `effectiveProjectRole` helper applied in every `requireRole` callsite. Member list shows "via org role" rows.
7. **Org switcher.** Nav affordance for users in 2+ orgs.
8. **Member invitations.** Email-based invite flow via Better Auth.
9. **Org settings page.** Rename, transfer ownership, soft-delete.
10. **Super-admin panel.** `/_admin/orgs`, `/_admin/users`, impersonate.

Each phase is demoable. Phase 5 is the largest single PR (URL refactor touches every project-scoped surface).

## Subdomain-readiness ledger

v1 stays on path-based routing but doesn't paint into a corner:

- **Slug validation** — DNS-safe `[a-z0-9-]{1,63}`, no leading/trailing dash, no underscores. Reserved-words list includes `www`, `api`, `app`, `admin`, `auth`, `mail`, `static`, `cdn`, `_admin`, `onboarding`, plus our route segments.
- **Single seam for "current org slug"** — one helper that reads from path params today, can read from `Host` header tomorrow.
- **Cookie domain** — leave default in v1. v2 subdomain rollout sets `cookie.domain: ".app.com"` (one config flip + forced re-login).
- **`trustedOrigins`** — implemented as a function that returns true for any subdomain of the production base host in prod.

## MCP token scope

MCP tokens are issued with `(userId, organizationId)` baked in. One token per org per user. `list_projects` returns only that org's projects; resource URIs `projectproject://orgs/<orgSlug>/...` are scoped accordingly. Token issuance UI lives in org settings.

## Org lifecycle

- **Voluntary leave** — any member can leave. Last owner cannot leave without transferring ownership or soft-deleting the org.
- **Member removal** — owner/admin can remove non-owners. Cascades all `projectMember` rows for that user in this org. Authored content (tickets, docs) keeps the user's `username` reference; UI shows "former member" badge.
- **Soft delete** — owner-initiated, 14-day grace period. `organization.deletedAt` set; sign-in into that org blocked. Super-admin can restore.
- **Hard delete** — after grace, cascade: projects → projectMembers → invitations → org row. FS sweep removes `data/orgs/<orgSlug>/`.
- **Rename** — `name` (display) editable any time by owner/admin. **Slug is immutable in v1** for URL stability.
- **Transfer ownership** — owner picks an existing org `admin`; both roles flip atomically. Required precondition for last-owner leave.

## Implementation tickets

See sibling files in this directory: `T-01-...md` through `T-11-...md`. Each is a vertical slice with explicit acceptance criteria and dependency graph.
