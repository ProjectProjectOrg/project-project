import * as Schema from "effect/Schema"
import { Slug } from "./Project"

export const OrgRole = Schema.Literal("owner", "admin", "member")
export type OrgRole = typeof OrgRole.Type

export const Org = Schema.Struct({
  slug: Slug,
  name: Schema.String,
  role: OrgRole
})
export type Org = typeof Org.Type
