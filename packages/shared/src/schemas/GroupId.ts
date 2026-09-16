import * as Schema from "effect/Schema"

export const GroupId = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^G-[1-9][0-9]*$/)),
  Schema.brand("GroupId")
)
export type GroupId = typeof GroupId.Type
