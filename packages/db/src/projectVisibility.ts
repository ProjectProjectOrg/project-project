import { isNotNull } from "drizzle-orm"

import { projectIndex } from "./schema"

export const publishedProject = (
  project: {
    readonly publishedAt: typeof projectIndex.publishedAt
  } = projectIndex
) => isNotNull(project.publishedAt)
