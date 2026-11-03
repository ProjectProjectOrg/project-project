import * as Schema from "effect/Schema"

import { GroupKind } from "../schemas/Group"

export const GroupFilter = Schema.Struct({
  kind: Schema.optional(Schema.Array(GroupKind)).annotate({
    description: "Group kinds to include."
  }),
  active: Schema.optional(Schema.Boolean).annotate({
    description:
      "Sprints only: `true` keeps sprints running now, `false` planned or completed ones."
  })
})
export type GroupFilter = typeof GroupFilter.Type
