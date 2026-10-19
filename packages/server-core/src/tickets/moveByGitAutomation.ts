import { ActivityActor, type GitAutomationEvent } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"

import type { ProjectGitAutomationShape } from "../projects/ProjectGitAutomation"
import { planGitAutomation } from "./gitAutomation"
import type { TicketDocsShape, TicketDocument } from "./TicketDocs"
import type { TicketIndexProject, TicketIndexShape } from "./TicketIndex"

export type GitAutomationDeps = Readonly<{
  ticketDocs: TicketDocsShape
  ticketIndex: TicketIndexShape
  gitAutomation: ProjectGitAutomationShape
}>

export const moveByGitAutomation = (
  deps: GitAutomationDeps,
  project: TicketIndexProject,
  ticket: TicketDocument,
  event: GitAutomationEvent | null
) =>
  Effect.gen(function* () {
    if (event === null) return ticket
    const config = yield* deps.gitAutomation.configFor(project.projectId)
    const target = planGitAutomation(ticket.status, event, config)
    if (target === null) return ticket
    return yield* deps.ticketDocs
      .update(
        project.orgSlug,
        project.projectSlug,
        ticket.id,
        (current) =>
          current.status !== ticket.status
            ? Effect.succeed(current)
            : DateTime.nowAsDate.pipe(
                Effect.map((updatedAt) => ({
                  ...current,
                  status: target,
                  updatedAt
                }))
              ),
        (next) => deps.ticketIndex.upsertTicket(project, next),
        { cause: "git_automation" }
      )
      .pipe(
        Effect.provideService(ActivityActor, ActivityActor.system("github"))
      )
  })
