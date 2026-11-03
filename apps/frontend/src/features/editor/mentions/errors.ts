import * as Schema from "effect/Schema"

export class MentionSearchFailed extends Schema.TaggedError<MentionSearchFailed>()(
  "MentionSearchFailed",
  {}
) {}
