import type { ProjectEvent } from "@pp/shared"

export const maxBodyBytes = 1024 * 1024
export const pingEvent = "ping"

export type EnvelopeContext = Readonly<{
  deliveryId: string
  createdAt: Date
  orgSlug: string
  projectSlug: string
  actor: Readonly<{ id: string; name: string }> | null
  baseUrl: string
}>

const projectUrl = (context: EnvelopeContext, path: string) =>
  new URL(
    `/orgs/${encodeURIComponent(context.orgSlug)}/projects/${encodeURIComponent(context.projectSlug)}${path}`,
    context.baseUrl
  ).toString()

const eventData = (event: ProjectEvent, context: EnvelopeContext) => {
  switch (event.kind) {
    case "sprint_created":
    case "sprint_renamed":
    case "sprint_started":
    case "sprint_completed":
    case "sprint_reopened":
    case "sprint_deleted":
      return {
        sprint: {
          id: event.id,
          title: event.title,
          startsAt: event.startsAt?.toISOString() ?? null,
          url: projectUrl(context, `/sprints/${event.id}`)
        }
      }
    default: {
      const ticket = {
        id: event.id,
        title: event.title,
        status: event.status,
        type: event.type ?? null,
        url: projectUrl(context, `/tickets/${event.id}`)
      }
      if (event.kind === "ticket_status_changed")
        return { ticket, previousStatus: event.previousStatus }
      if (event.kind === "ticket_assignees_changed")
        return {
          ticket,
          assignees: event.assignees,
          added: event.added,
          removed: event.removed
        }
      return { ticket }
    }
  }
}

const envelope = (
  type: string,
  data: unknown,
  context: EnvelopeContext
): string =>
  JSON.stringify({
    id: context.deliveryId,
    type,
    createdAt: context.createdAt.toISOString(),
    org: { slug: context.orgSlug },
    project: {
      slug: context.projectSlug,
      url: projectUrl(context, "")
    },
    actor: context.actor,
    data
  })

export const eventEnvelope = (event: ProjectEvent, context: EnvelopeContext) =>
  envelope(event.kind, eventData(event, context), context)

export const pingEnvelope = (context: EnvelopeContext) =>
  envelope(pingEvent, {}, context)

export const bodyBytes = (body: string) =>
  new TextEncoder().encode(body).byteLength
