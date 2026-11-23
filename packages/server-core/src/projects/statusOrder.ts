import { projectStatus } from "@pp/db/schema"
import { asc, sql } from "drizzle-orm"

export const statusOrder = [
  asc(projectStatus.phase),
  asc(sql`${projectStatus.orderKey} collate "C"`)
]
