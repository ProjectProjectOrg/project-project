import type { ProjectChange } from "@pp/shared"
import { sql } from "drizzle-orm"

export const notifyProjectChange = (
  projectId: string,
  { kind, id }: Readonly<{ kind: ProjectChange["kind"]; id: string | null }>
) => sql`select notify_project_change(${projectId}::uuid, ${kind}, ${id})`
