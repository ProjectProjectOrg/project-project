import * as Schema from "effect/Schema"
import { Slug } from "./Project"

export const ORG_DELETE_GRACE_DAYS = 14

export const OrgRole = Schema.Literal("owner", "admin", "member")
export type OrgRole = typeof OrgRole.Type

export const Org = Schema.Struct({
  slug: Slug,
  name: Schema.String,
  role: OrgRole
})
export type Org = typeof Org.Type

export const OrgDetail = Schema.Struct({
  id: Schema.String,
  slug: Slug,
  name: Schema.String,
  role: OrgRole,
  createdAt: Schema.Date,
  deletedAt: Schema.NullOr(Schema.Date),
  purgeAt: Schema.NullOr(Schema.Date)
})
export type OrgDetail = typeof OrgDetail.Type
