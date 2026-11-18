import { ProjectPolicy } from "@pp/access/policies"
import { canHoldChildren } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { currentUserId } from "@/features/auth/atoms/auth"
import { feedbackStatus } from "@/features/feedback/atoms/feedback"
import {
  orgActor,
  orgDetail,
  orgRequest
} from "@/features/organizations/atoms/orgs"
import {
  project,
  projectActor,
  projectRequest
} from "@/features/projects/atoms/projects"
import {
  sprintListRequest,
  sprintMembership
} from "@/features/sprints/atoms/sprintList"
import {
  ticketSubscribers,
  ticketSubscribersRequest
} from "@/features/subscriptions/atoms/ticketSubscribers"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import {
  ticketPermissions,
  type TicketPermissions
} from "@/features/tickets/lib/ticketPermissions"

import { pointedAt, type TicketContext } from "../lib/commandMenu"
import type { CommandContext } from "../lib/commands"
import { pointedTicket } from "./commandMenu"

export type CommandContextKey = Readonly<{
  orgSlug: string
  projectSlug: string | null
  ticket: TicketContext | null
}>

export type TargetContext = Omit<
  CommandContext,
  "routeProjectSlug" | "selection" | "sprint" | "view"
>

const NO_PROJECT_TICKETS: TicketPermissions = {
  create: true,
  edit: false,
  assign: false,
  split: false,
  move: false,
  archive: false,
  delete: false,
  stackBranch: false,
  clearBranch: false,
  planSprints: true
}

const success = <A>(result: AsyncResult.AsyncResult<A, unknown>) =>
  AsyncResult.isSuccess(result) ? result.value : null

export const commandContext = Atom.family((key: CommandContextKey) =>
  Atom.make((get) => {
    const { orgSlug, projectSlug, ticket } = key
    const org = get(orgActor(orgRequest(orgSlug)))
    const feedback = success(get(feedbackStatus(orgSlug)))
    const projectReq =
      projectSlug === null ? null : projectRequest(orgSlug, projectSlug)
    const actor = projectReq === null ? null : get(projectActor(projectReq))
    const detail =
      ticket === null
        ? null
        : success(
            get(
              ticketDetail(
                ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)
              )
            )
          )
    const ticketData =
      pointedAt(get(pointedTicket), ticket)?.row ?? detail ?? null
    const membership =
      ticket === null
        ? null
        : success(
            get(
              sprintMembership(sprintListRequest(ticket.orgSlug, ticket.slug))
            )
          )
    const subscribers =
      ticket === null
        ? null
        : success(
            get(
              ticketSubscribers(
                ticketSubscribersRequest(
                  ticket.orgSlug,
                  ticket.slug,
                  ticket.ticketId
                )
              )
            )
          )
    return {
      orgSlug,
      orgName: success(get(orgDetail(orgRequest(orgSlug))))?.name ?? null,
      orgActor: org,
      projectSlug,
      ticket,
      ticketData,
      ticketDetail: detail,
      ticketSprint:
        ticket === null ? null : (membership?.get(ticket.ticketId) ?? null),
      ticketSubscribed: subscribers?.subscribed ?? null,
      canHoldChildren:
        ticketData !== null && canHoldChildren(ticketData, ticketData.parent),
      viewerId: get(currentUserId) ?? null,
      canSeeOrgMembers: org.call("org", "members"),
      canCreateProjects: org.call("projects", "create"),
      canSendFeedback: feedback?.enabled ?? false,
      projectActor: actor,
      project: projectReq === null ? null : success(get(project(projectReq))),
      tickets: actor === null ? NO_PROJECT_TICKETS : ticketPermissions(actor),
      canManageProject:
        actor !== null && ProjectPolicy.canUpdate(actor, { settings: true })
    }
  })
)
