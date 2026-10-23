import * as Effect from "effect/Effect"
import type * as SqlClient from "effect/sql/SqlClient"

import type { EverhourShape } from "./Everhour"

export const addProjectUsers = (
  deps: Readonly<{ everhour: EverhourShape; sql: SqlClient.SqlClient }>,
  apiKey: string,
  everhourProjectId: string,
  userIds: ReadonlyArray<string>
) =>
  deps.sql.withTransaction(
    Effect.gen(function* () {
      yield* deps.sql`select pg_advisory_xact_lock(hashtext(${`everhour-project-users:${everhourProjectId}`}))`
      const project = yield* deps.everhour.getProject(apiKey, everhourProjectId)
      if (project.users === null) return false
      const assigned = project.users
      const missing = [...new Set(userIds)].filter(
        (id) => !assigned.includes(id)
      )
      if (missing.length === 0) return false
      yield* deps.everhour.assignProjectUsers(apiKey, everhourProjectId, [
        ...assigned,
        ...missing
      ])
      return true
    })
  )
