import * as Schema from "effect/Schema"
import { GroupKind } from "../../schemas/Group"

export const GroupFilter = Schema.Struct({
  kind: Schema.optional(Schema.Array(GroupKind)),
  active: Schema.optional(Schema.Boolean)
})
export type GroupFilter = typeof GroupFilter.Type
