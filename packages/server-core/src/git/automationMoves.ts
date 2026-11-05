import { ActivityActor, type GitAutomationEvent } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"

import type * as Markdown from "../markdown/Markdown"
import type * as TicketDocs from "../tickets/TicketDocs"
import type { TicketDocumentLock } from "../tickets/ticketDocumentLock"
import type * as TicketIndex from "../tickets/TicketIndex"
import type { TicketProject } from "../tickets/ticketProject"
import { gitAutomationEvent, planGitAutomation } from "./automation"
import type * as ProjectGitAutomation from "./ProjectGitAutomation"

export type GitAutomationDeps = Readonly<{
  ticketDocs: TicketDocs.TicketDocs["Service"]
  ticketIndex: TicketIndex.TicketIndex["Service"]
  gitAutomation: ProjectGitAutomation.ProjectGitAutomation["Service"]
}>

export const moveByGitAutomation = (
  deps: GitAutomationDeps,
  project: TicketProject,
  ticket: TicketDocs.TicketDocument,
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
        project.slug,
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

export const moveForDeletedBranch = (
  deps: GitAutomationDeps &
    Readonly<{
      ticketDocumentLock: Pick<
        TicketDocumentLock["Service"],
        "withTicketDocumentLock"
      >
    }>,
  match: TicketIndex.TicketIndexMatch
): Effect.Effect<void, Markdown.MarkdownError> =>
  deps.ticketDocumentLock.withTicketDocumentLock(
    match.orgSlug,
    match.slug,
    match.ticketId,
    deps.ticketDocs.read(match.orgSlug, match.slug, match.ticketId).pipe(
      Effect.flatMap((ticket) =>
        moveByGitAutomation(
          deps,
          match,
          ticket,
          ticket.branch === match.branch ? "branch_deleted" : null
        )
      ),
      Effect.asVoid,
      Effect.catchTags({
        NotFound: () => Effect.void,
        MalformedTicketDocument: () => Effect.void
      })
    )
  )

export const gitAutomationActivity = { statusCause: "git_automation" } as const

export const withGitAutomation = (
  gitAutomation: ProjectGitAutomation.ProjectGitAutomation["Service"],
  projectId: string,
  before: TicketDocs.TicketDocument,
  after: TicketDocs.TicketDocument
): Effect.Effect<TicketDocs.TicketDocument> => {
  const event = gitAutomationEvent(before, after)
  if (event === null) return Effect.succeed(after)
  return Effect.map(gitAutomation.configFor(projectId), (config) => {
    const target = planGitAutomation(after.status, event, config)
    return target === null ? after : { ...after, status: target }
  })
}
