// packages/shared/src/schemas/User.ts
//
// THE PUBLIC `User` SHAPE.
// ============================================================================
// This is what `/me` returns and what `CurrentUser` carries through the
// middleware. Frontend code reads this; backend handlers return values
// matching it.
//
// Note: this is a Schema, not just a TypeScript interface. The runtime
// `User` constant is what `addSuccess(User)` references on an endpoint;
// the type alias `User` (derived via `typeof User.Type`) is what TypeScript
// uses everywhere else.
//
// FIELD CHOICES
// ----------------------------------------------------------------------------
// Match Better Auth's user shape, but trim to what we actually use:
//
//   id          string                 — Better Auth's user id (uuid-ish)
//   email       string                 — primary email (Better Auth requires it)
//   name        string                 — display name from GitHub
//   image       string | null          — avatar url, may be missing
//   createdAt   Date (ISO string wire) — when the row was created
//
// We deliberately don't expose `emailVerified`, `updatedAt`, or
// provider-specific fields. Add them only if a UI needs them.
//
// DATE HANDLING
// ----------------------------------------------------------------------------
// `Schema.Date` decodes from an ISO string into a `Date` object on the
// frontend, encodes a `Date` to an ISO string on the backend. This matches
// Better Auth's wire format (Drizzle returns `Date` objects, JSON.stringify
// turns those into ISO strings).
//
// In Phase 2 (markdown frontmatter) you'll meet a related quirk: gray-matter
// parses some YAML date forms into `Date`, others into strings. The fix is
// to be strict at the schema boundary — declare ISO strings, validate, done.

import { Schema } from "effect"

export const User = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
  // GitHub login, populated on first sign-in via mapProfileToUser. Nullable
  // because the column is nullable for back-compat — once members are wired
  // up everywhere, every active user will have one.
  username: Schema.NullOr(Schema.String),
  image: Schema.NullOr(Schema.String),
  createdAt: Schema.Date,
  // The slug of the org this user is currently acting in (mirrors
  // session.activeOrganizationId, joined to organization.slug). Null when
  // the user has no active org (fresh signup, pre-onboarding). Frontend
  // reads this off `meAtom` so "current org" is available everywhere
  // without a second fetch.
  activeOrgSlug: Schema.NullOr(Schema.String)
})
export type User = typeof User.Type
