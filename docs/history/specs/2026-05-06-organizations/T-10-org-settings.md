# T-10 — Org settings: rename, transfer ownership, soft-delete, member management

**Status:** ready
**Depends on:** T-01, T-09
**Phase:** 9

## Goal

Org owners/admins manage their org through `/orgs/:slug/settings`. Rename display, change member roles, transfer ownership, and (for owners only) soft-delete the org with a 14-day grace period.

## Scope

### Routes

- `/orgs/:slug/settings/general` — rename display name, view slug (read-only), Stripe placeholder fields.
- `/orgs/:slug/settings/members` — list members + their roles, role-change (owner only), remove member, plus the invitation form/list from T-09.
- `/orgs/:slug/settings/transfer` — pick an existing `admin` to promote to owner; current owner becomes admin atomically. Confirmation dialog.
- `/orgs/:slug/settings/danger` — soft-delete org. Owner only. Confirmation dialog requires typing the org slug.

### Backend

- HttpApi endpoints:
  - `PATCH /orgs/:slug` — update name + metadata (Stripe placeholder fields). Owner/admin.
  - `POST /orgs/:slug/transfer` — body: `{ toUserId }`. Atomic: target user → `owner`, current owner → `admin`. Owner only. Target must already be an org `admin`.
  - `DELETE /orgs/:slug` — soft-delete: set `organization.deletedAt = now()`. Owner only. Block all subsequent reads/writes for non-super-admins.
  - `POST /orgs/:slug/restore` — clear `deletedAt`. Super-admin only.
  - `PATCH /orgs/:slug/members/:userId` — change member role. Owner only. Cannot demote yourself if you're the last owner.
  - `DELETE /orgs/:slug/members/:userId` — remove member. Owner/admin. Cannot remove the last owner.
- Permission rules:
  - Owner: all of the above.
  - Admin: rename, member role change for non-owners (excluding admin↔admin self-changes? — keep simple: admins can promote `member` to `admin`, demote `admin` to `member`, but cannot touch the owner row).
  - Member: read-only on members list.

### Cascades on member removal

- Delete all `projectMember` rows where `(userId, projectId in this org)`.
- Authored content (tickets, docs) keeps the username reference — it's just a string at that point. UI surfaces "former member" affordance by checking if the username resolves to an actual `member` row in the current org.

### Last-owner rules

- Cannot remove yourself if you're the last owner. UI hides the "leave org" button; backend rejects the call.
- Cannot demote yourself from `owner` if you're the last owner.
- Cannot soft-delete the org without first transferring or accepting that all data goes (deletion does cover this — the data goes either way after the grace period).
- Transfer ownership flow exists specifically to unblock "I want to leave but I'm the only owner."

### Soft-delete behavior

- `organization.deletedAt` is non-null → all org-scoped routes return a "this org has been deleted" page with the restore deadline (14 days from `deletedAt`).
- Background job (cron, daily) sweeps orgs past the deadline → hard delete: cascade DB rows, remove `data/orgs/<orgSlug>/` directory.
- Restore (super-admin only, T-11) clears `deletedAt`.

## Out of scope

- Audit log of who did what in settings.
- Email notifications on settings changes.
- Bulk member operations.

## Acceptance criteria

1. Owner can rename the org display name. Slug field is read-only with explanation.
2. Owner can promote a member to admin and back down.
3. Owner can transfer ownership to an existing admin. After transfer, both roles flipped, original owner is now `admin`.
4. Last owner cannot leave / cannot demote self / cannot remove self.
5. Soft-deleting the org → 14-day grace period state. Members see a deleted-state page.
6. Removing a member cascades their `projectMember` rows. Their authored tickets remain readable; their `username` shows a "former member" badge.
7. Admin can do everything except transfer ownership and soft-delete.
8. The "type the slug to confirm" pattern protects soft-delete from accidental clicks.

## Notes

- Hard-delete cron lives in `packages/backend/src/jobs/` (or whatever the existing jobs convention is — there might not be one yet, in which case introduce it minimally).
- The cron also handles orphaned `data/orgs/<slug>` directories (where the org row is gone but FS wasn't cleaned).
