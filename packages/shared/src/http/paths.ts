import * as Schema from "effect/Schema"

import { GroupId } from "../groups/Group"
import { Slug } from "../projects/Project"
import { TicketId } from "../tickets/Ticket"

export const OrgPath = Schema.Struct({ orgSlug: Slug })

export const ProjectPath = Schema.Struct({ orgSlug: Slug, slug: Slug })

export const TicketPath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  id: TicketId
})

export const GroupPath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  id: GroupId
})
