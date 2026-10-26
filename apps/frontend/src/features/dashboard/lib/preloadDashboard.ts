import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Registry from "effect/reactivity/AtomRegistry"

import { project, projectRequest } from "@/features/projects/atoms/projects"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  myTickets,
  myTicketsByProject,
  myTicketsByProjectRequest,
  myTicketsRequest,
  recentTickets,
  recentTicketsRequest,
  type MyTicketsByProjectValue,
  type OrgTicketsValue
} from "@/features/tickets/atoms/myTickets"

const PROJECT_PRELOAD_CONCURRENCY = 4

const projectSlugsOf = (
  lists: ReadonlyArray<Option.Option<OrgTicketsValue>>,
  byProject: Option.Option<MyTicketsByProjectValue>
): ReadonlySet<string> =>
  new Set([
    ...lists.flatMap((value) =>
      Option.isSome(value)
        ? value.value.tickets.map(({ project }) => project.slug)
        : []
    ),
    ...(Option.isSome(byProject)
      ? byProject.value.groups.map(({ project }) => project.slug)
      : [])
  ])

export const preloadDashboard = (
  registry: Registry.AtomRegistry,
  orgSlug: string
) =>
  Effect.gen(function* () {
    const [lists, byProject] = yield* Effect.all(
      [
        Effect.all(
          [
            myTickets(myTicketsRequest(orgSlug)),
            recentTickets(recentTicketsRequest(orgSlug))
          ].map((atom) =>
            Registry.getResult(registry, atom).pipe(Effect.option)
          ),
          { concurrency: "unbounded" }
        ),
        Registry.getResult(
          registry,
          myTicketsByProject(myTicketsByProjectRequest(orgSlug))
        ).pipe(Effect.option)
      ],
      { concurrency: "unbounded" }
    )
    yield* Effect.forEach(
      projectSlugsOf(lists, byProject),
      (slug) =>
        Effect.all(
          [
            Registry.getResult(
              registry,
              project(projectRequest(orgSlug, slug))
            ),
            Registry.getResult(
              registry,
              statusesFor(statusesRequest(orgSlug, slug))
            )
          ],
          { concurrency: "unbounded" }
        ).pipe(Effect.ignore),
      { concurrency: PROJECT_PRELOAD_CONCURRENCY, discard: true }
    )
  })
