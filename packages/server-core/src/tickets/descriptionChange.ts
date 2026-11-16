import * as Context from "effect/Context"

export const DescriptionChange = Context.Reference<string | null>(
  "@pp/server-core/tickets/DescriptionChange",
  { defaultValue: () => null }
)
