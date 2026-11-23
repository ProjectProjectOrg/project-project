import * as Schema from "effect/Schema"

import { GroupId } from "../groups/GroupId"
import { TicketId } from "./Ticket"

export const ProjectChange = Schema.Union([
  Schema.Struct({
    kind: Schema.Literals(["tickets", "comments", "subscribers"]),
    id: Schema.NullOr(TicketId)
  }),
  Schema.Struct({
    kind: Schema.Literal("sprints"),
    id: Schema.NullOr(GroupId)
  }),
  Schema.Struct({ kind: Schema.Literal("project"), id: Schema.Null })
])
export type ProjectChange = typeof ProjectChange.Type
