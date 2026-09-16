import * as Schema from "effect/Schema"

export const JiraMigrationReport = Schema.Struct({
  migrationId: Schema.String,
  projectSlug: Schema.String,
  tickets: Schema.Number,
  comments: Schema.Number,
  groups: Schema.Number,
  createdStatuses: Schema.Array(Schema.String),
  tags: Schema.Array(Schema.String),
  attachmentsPending: Schema.Number
})
export type JiraMigrationReport = typeof JiraMigrationReport.Type
