import { Effective, Project } from "@pp/access/roles"
import { ProjectScope } from "@pp/shared"
import * as Singleton from "effect/cluster/Singleton"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schedule from "effect/Schedule"

import * as GitSyncSchedule from "./GitSyncSchedule"
import * as TicketGit from "./TicketGit"

const PROJECTS_PER_SWEEP = 25

const systemPermissions = Effective.roleOnProject("owner", null).pipe(
  Option.getOrElse(() => Project.projectStatement.role({}))
)

const systemScope = (project: GitSyncSchedule.DueProject) =>
  ({
    userId: "system",
    organizationId: project.organizationId,
    orgSlug: project.orgSlug,
    orgRole: "owner",
    projectId: project.projectId,
    slug: project.slug,
    role: null,
    permissions: systemPermissions
  }) satisfies ProjectScope["Service"]

export const sweep = Effect.gen(function* () {
  const schedule = yield* GitSyncSchedule.GitSyncSchedule
  const git = yield* TicketGit.TicketGit
  const due = yield* schedule.due(PROJECTS_PER_SWEEP)
  yield* Effect.forEach(
    due,
    (project) =>
      git.syncGitStates().pipe(
        Effect.provideService(ProjectScope, systemScope(project)),
        Effect.catchCause((cause) =>
          Effect.logWarning("Git state sweep could not sync a project", {
            projectId: project.projectId,
            cause
          })
        )
      ),
    { concurrency: 2, discard: true }
  )
}).pipe(Effect.withSpan("GitStateSweep.sweep"))

export const GitStateSweepLive = Singleton.make(
  "GitStateSweep",
  sweep.pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("Git state sweep failed", cause)
    ),
    Effect.repeat(Schedule.spaced("1 minute"))
  )
)
