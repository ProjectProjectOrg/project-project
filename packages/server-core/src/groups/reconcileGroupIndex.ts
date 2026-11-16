import * as Effect from "effect/Effect"

import * as GroupDocs from "./GroupDocs"
import * as GroupIndex from "./GroupIndex"

export const reconcileGroupIndex = Effect.fn("reconcileGroupIndex")(function* (
  project: GroupIndex.GroupProject
) {
  const docs = yield* GroupDocs.GroupDocs
  const index = yield* GroupIndex.GroupIndex
  const ids = yield* docs.listIds(project.orgSlug, project.slug)
  const groups = yield* Effect.forEach(
    ids,
    (id) => docs.read(project.orgSlug, project.slug, id),
    { concurrency: 8 }
  )
  return yield* index.rebuildProject(project, groups)
})
