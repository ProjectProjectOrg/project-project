import type { Db } from "@pp/db"
import { projectIndex } from "@pp/db/schema"
import { NotFound, type ProjectScope } from "@pp/shared"
import { eq } from "drizzle-orm"
import * as Effect from "effect/Effect"

import type * as ProjectDocs from "./ProjectDocs"

type ProjectRef = Pick<
  ProjectScope["Service"],
  "projectId" | "orgSlug" | "slug"
>

export const readProjectDocument = Effect.fn("readProjectDocument")(function* ({
  db,
  docs,
  project,
  indexed
}: Readonly<{
  db: Db["Service"]
  docs: ProjectDocs.ProjectDocs["Service"]
  project: ProjectRef
  indexed?: Pick<typeof projectIndex.$inferSelect, "estimation">
}>) {
  const [file, row] = yield* Effect.all(
    [
      docs.read(project.orgSlug, project.slug),
      indexed === undefined
        ? db.query.projectIndex
            .findFirst({
              columns: { estimation: true },
              where: { id: project.projectId }
            })
            .pipe(Effect.orDie)
        : Effect.succeed(indexed)
    ],
    { concurrency: 2 }
  )
  if (!row) return yield* new NotFound()
  if (row.estimation === file.estimation) return file

  return yield* db
    .transaction(() =>
      Effect.gen(function* () {
        const [locked] = yield* db
          .select({ estimation: projectIndex.estimation })
          .from(projectIndex)
          .where(eq(projectIndex.id, project.projectId))
          .for("update")
          .pipe(Effect.orDie)
        if (!locked) return yield* new NotFound()
        const current = yield* docs.read(project.orgSlug, project.slug)
        if (locked.estimation !== current.estimation) {
          yield* db
            .update(projectIndex)
            .set({ estimation: current.estimation })
            .where(eq(projectIndex.id, project.projectId))
            .pipe(Effect.orDie)
        }
        return current
      })
    )
    .pipe(Effect.catchTag("SqlError", Effect.die))
})
