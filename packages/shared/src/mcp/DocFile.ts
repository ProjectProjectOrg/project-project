import * as Schema from "effect/Schema"

export const DocFile = Schema.Struct({
  path: Schema.String,
  content: Schema.String
})

export type DocFile = typeof DocFile.Type
