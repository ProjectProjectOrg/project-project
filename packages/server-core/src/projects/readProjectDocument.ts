import type { Db } from "@pp/db"
import { projectIndex } from "@pp/db/schema"
import { NotFound, type ProjectScopeShape } from "@pp/shared"
import { eq } from "drizzle-orm"
import * as Effect from "effect/Effect"

import type { ProjectDocs } from "./ProjectDocs"

type ProjectRef = Pick<ProjectScopeShape, "projectId" | "orgSlug" | "slug">

export const readProjectDocument = Effect.fn("readProjectDocument")(function* ({
  db,
  docs,
  project
}: Readonly<{
  db: Db["Service"]
  docs: ProjectDocs["Service"]
  project: ProjectRef
}>) {
  const file = yield* docs.read(project.orgSlug, project.slug)
  const row = yield* db.query.projectIndex
    .findFirst({
      columns: { estimation: true },
      where: { id: project.projectId }
    })
    .pipe(Effect.orDie)
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
