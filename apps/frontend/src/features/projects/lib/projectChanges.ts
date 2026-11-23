import type { ProjectChange } from "@pp/shared"
import * as Match from "effect/Match"

import { Keys, projectScope, type ReactivityKey } from "@/api/keys"

type ProjectParams = Readonly<{ orgSlug: string; slug: string }>

export const resyncKeys = ({ orgSlug, slug }: ProjectParams) => {
  const scope = projectScope(orgSlug, slug)
  return [
    ...Keys.ticketsChanged(scope),
    Keys.ticketTitleQuery(scope),
    Keys.ticketUpdatedQuery(scope),
    Keys.ticketComments(scope),
    Keys.sprints(scope),
    Keys.sprintMembership(scope),
    Keys.tags(scope),
    Keys.tagUsage(scope),
    Keys.statuses(scope),
    Keys.project(scope),
    Keys.projectLibrary(scope),
    Keys.gitAutomation(scope),
    Keys.gitStates(scope),
    Keys.branches(scope),
    Keys.figmaProject(scope),
    Keys.figmaTicketLinks(scope),
    Keys.everhourProject(scope),
    Keys.slackProject(scope),
    Keys.workTypes(scope),
    Keys.orgMembers(orgSlug),
    Keys.projects(orgSlug),
    Keys.projectResync(scope)
  ] satisfies ReadonlyArray<ReactivityKey>
}

export const changeKeys = (params: ProjectParams, change: ProjectChange) => {
  const scope = projectScope(params.orgSlug, params.slug)
  return Match.value(change).pipe(
    Match.withReturnType<ReadonlyArray<ReactivityKey>>(),
    Match.discriminatorsExhaustive("kind")({
      tickets: () => [Keys.ticketsIn(scope)],
      comments: ({ id }) =>
        id === null
          ? [Keys.ticketComments(scope), Keys.projectResync(scope)]
          : [Keys.ticketComments(scope), Keys.comments(scope, id)],
      subscribers: ({ id }) =>
        id === null
          ? [Keys.ticketsIn(scope)]
          : [Keys.ticketSubscribers(scope, id)],
      sprints: ({ id }) =>
        id === null
          ? [Keys.sprints(scope), Keys.projectResync(scope)]
          : [Keys.sprints(scope), Keys.sprint(scope, id)],
      project: () => resyncKeys(params)
    })
  )
}
