import type { Db } from "@pp/db"
import { NotFound } from "@pp/shared"
import * as Effect from "effect/Effect"

export const projectInOrg = Effect.fn("projectInOrg")(function* (
  db: Db["Service"],
  orgSlug: string,
  slug: string
) {
  const row = yield* db.query.projectIndex
    .findFirst({
      columns: { id: true, organizationId: true },
      where: {
        slug,
        organization: { slug: orgSlug },
        publishedAt: { isNotNull: true }
      }
    })
    .pipe(Effect.orDie)
  return row ?? (yield* new NotFound())
})
