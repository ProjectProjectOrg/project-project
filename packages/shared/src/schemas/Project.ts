// Project schema — over-the-wire shape returned by /projects endpoints.
//
// `slug` is the URL-safe identifier. We constrain it at the schema boundary
// rather than just trusting the server, because the slug is also a filesystem
// path component on disk. A bad slug is a bad path. Lowercase a-z0-9 + dashes
// only, can't start or end with a dash.
//
// `Project` is the full record (used by list responses for now; later by /get).
// `CreateProjectInput` is the inline-create payload — name only, slug is
// derived on the server so the client doesn't have to deal with conflicts.

import { Schema } from "effect"

export const Slug = Schema.String.pipe(
  Schema.pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  Schema.minLength(1),
  Schema.maxLength(64)
)
export type Slug = typeof Slug.Type

export const Project = Schema.Struct({
  slug: Slug,
  name: Schema.String,
  ownerId: Schema.String,
  createdAt: Schema.Date
})
export type Project = typeof Project.Type

export const CreateProjectInput = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(120))
})
export type CreateProjectInput = typeof CreateProjectInput.Type

// Returned by GET /projects/:slug. The list endpoint stays index-shaped (no
// body); this one carries the markdown body so the detail view can render it
// without a second round trip.
export const ProjectDetail = Schema.Struct({
  ...Project.fields,
  body: Schema.String
})
export type ProjectDetail = typeof ProjectDetail.Type

// Partial update payload. Both fields optional — the client sends only what
// changed. Empty object is allowed but a no-op on the server.
export const UpdateProjectInput = Schema.Struct({
  name: Schema.optional(
    Schema.String.pipe(Schema.minLength(1), Schema.maxLength(120))
  ),
  body: Schema.optional(Schema.String)
})
export type UpdateProjectInput = typeof UpdateProjectInput.Type
