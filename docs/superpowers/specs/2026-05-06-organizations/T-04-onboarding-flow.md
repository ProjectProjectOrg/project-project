# T-04 — Onboarding: self-serve org creation

**Status:** ready
**Depends on:** T-01
**Phase:** 4

## Goal

When a freshly-signed-up user lands in the app with zero orgs, route them to an `/onboarding` screen that creates their first organization. After submission, they're org `owner` and land in `/orgs/:newSlug`.

## Scope

- New route `/onboarding` in `packages/frontend/src/routes/`.
- Form fields: `name` (display), `slug` (auto-suggested from name as user types; user can edit). Client-side validation against `orgSlug.ts` shared rules. Stripe placeholder fields: `companyName`, `billingEmail` — store on `organization.metadata`, no Stripe integration yet.
- Backend endpoint to create an org (or call Better Auth's directly from frontend via `auth.client.organization.create`). Pick whichever is smoother:
  - Option A: thin HttpApi endpoint `POST /orgs` that wraps `auth.api.createOrganization`. Lets us add server-side rules (slug reservation, etc.) cleanly.
  - Option B: client-side `auth.client.organization.create` directly. Lighter, less typed.
  - **Recommend A** for consistency with the rest of the HttpApi.
- Server-side: validate slug against reserved list + DNS rules + uniqueness. Create org. Add caller as `owner`. Return new org.
- After success: call `auth.client.organization.setActive(newOrgId)`, navigate to `/orgs/:newSlug`.
- Add a route guard on `/_authed` that, if `member` table has zero rows for the user, redirects to `/onboarding`. (Inverse: if user is *on* `/onboarding` and *has* orgs, redirect to last active.)

## Out of scope

- Invitation acceptance flow (T-09).
- Multi-org support / switcher (T-08).
- Stripe wiring (separate phase).
- Project creation on onboarding — show empty workspace with a CTA, that's enough.

## Acceptance criteria

1. New user signs up with GitHub → lands on `/onboarding`.
2. Submitting valid form → `POST /orgs` (or `auth.client.organization.create`) succeeds → user is `owner` of new org → URL becomes `/orgs/:slug`.
3. Submitting invalid slug (reserved, malformed, taken) → inline validation error, no submission.
4. Refreshing `/onboarding` while *already* in an org → redirect to that org.
5. Refreshing `/orgs/:slug` while in zero orgs (e.g. soft-delete) → redirect to `/onboarding`.

## Notes

- Slug auto-suggest: lowercase the name, replace non-alphanumeric runs with `-`, trim leading/trailing `-`, cap to 30 chars.
- "What's a slug?" tooltip near the field — non-dev users won't know.
- Don't auto-create a default project. Empty workspace is fine for v1.
- The `metadata` field on `organization` is JSON — Stripe placeholder fields go there until billing ships.
