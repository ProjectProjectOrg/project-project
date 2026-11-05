# T-09 — Member invitations via Better Auth

**Status:** ready
**Depends on:** T-01
**Phase:** 8

## Goal

Org owners/admins can invite users to their org by email, with a chosen role (`admin | member`). Invitee receives an email with a magic link, clicks it, completes sign-in if needed, and lands in the org as the assigned role.

## Scope

### Backend

- HttpApi endpoints:
  - `POST /orgs/:orgSlug/invitations` — body: `{ email, role }`. Calls `auth.api.createInvitation`.
  - `GET /orgs/:orgSlug/invitations` — list pending invitations. Owner/admin only.
  - `DELETE /orgs/:orgSlug/invitations/:id` — cancel pending invite.
  - `POST /invitations/:token/accept` — invitee endpoint. Calls `auth.api.acceptInvitation`. Returns the org.
- Permission gate: `currentOrg.requireRole(["owner", "admin"])` on create/list/delete.
- Email send: Better Auth's `sendInvitationEmail` hook. For v1, log the URL to console (mock SMTP). Real SMTP wiring tracked separately.

### Frontend

- New section in org settings (T-10) — but the _invite_ form can ship here standalone, mounted on `/orgs/:slug/settings/members`.
- Form: email input, role select (`admin | member`), submit. After success, invite appears in pending-invitations list with cancel affordance.
- New route `/invite/:token`:
  - If unauthed: store token in localStorage, redirect to `/login`.
  - On post-login redirect: read token, call `POST /invitations/:token/accept`, navigate to `/orgs/:slug`.
  - If token invalid / expired: show error with "Contact your admin" message.

## Out of scope

- Real SMTP (separate ops ticket).
- Bulk invites / CSV upload.
- Role change after acceptance — covered by org settings (T-10).
- Re-sending an invite — covered by org settings (T-10).

## Acceptance criteria

1. Owner invites `someone@example.com` as `member`. Pending invitation appears. Email URL logged to console (or sent via configured SMTP).
2. Cancelling a pending invite removes it from the list.
3. New invitee clicks the link → gets prompted to sign in (GitHub for now) → after sign-in, lands in the org as a `member`.
4. Existing user invited to a second org → clicks link → already authed → accept call fires → lands in new org.
5. Expired token → error page with helpful message.
6. Invitee cannot be added to the org with `owner` role — only `admin | member`. Owner role is reserved for transfer-ownership flows.

## Notes

- Better Auth invitations expire on its built-in schedule (default 48h). Override via plugin config if 48h feels wrong.
- The `inviterId` field on `invitation` is set automatically by the plugin from the calling user.
- For the "store token in localStorage during OAuth round-trip" pattern, watch out for session-fixation-y behavior — wipe the token after first use.
