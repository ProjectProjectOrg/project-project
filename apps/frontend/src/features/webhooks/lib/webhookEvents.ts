import type {
  ProjectEventKind,
  WebhookDelivery,
  WebhookHeader
} from "@pp/shared"

import { m } from "@/paraglide/messages"

export const ticketEvents: ReadonlyArray<ProjectEventKind> = [
  "ticket_created",
  "ticket_status_changed",
  "ticket_completed",
  "ticket_reopened",
  "ticket_assignees_changed"
]

export const sprintEvents: ReadonlyArray<ProjectEventKind> = [
  "sprint_created",
  "sprint_renamed",
  "sprint_started",
  "sprint_completed",
  "sprint_reopened",
  "sprint_deleted"
]

export const eventLabel: Readonly<Record<ProjectEventKind, () => string>> = {
  ticket_created: () => m.webhooks_event_ticket_created(),
  ticket_status_changed: () => m.webhooks_event_ticket_status_changed(),
  ticket_completed: () => m.webhooks_event_ticket_completed(),
  ticket_reopened: () => m.webhooks_event_ticket_reopened(),
  ticket_assignees_changed: () => m.webhooks_event_ticket_assignees_changed(),
  sprint_created: () => m.webhooks_event_sprint_created(),
  sprint_renamed: () => m.webhooks_event_sprint_renamed(),
  sprint_started: () => m.webhooks_event_sprint_started(),
  sprint_completed: () => m.webhooks_event_sprint_completed(),
  sprint_reopened: () => m.webhooks_event_sprint_reopened(),
  sprint_deleted: () => m.webhooks_event_sprint_deleted()
}

export const toggleEvent = (
  events: ReadonlyArray<ProjectEventKind>,
  kind: ProjectEventKind,
  on: boolean
): ReadonlyArray<ProjectEventKind> =>
  on
    ? events.includes(kind)
      ? events
      : [...events, kind]
    : events.filter((event) => event !== kind)

export const filledHeaders = (
  headers: ReadonlyArray<WebhookHeader>
): ReadonlyArray<WebhookHeader> =>
  headers.flatMap((header) => {
    const name = header.name.trim()
    return name === "" && header.value === ""
      ? []
      : [{ name, value: header.value }]
  })

const dayMs = 24 * 60 * 60 * 1000

export const canRetry = (delivery: WebhookDelivery, now: Date) =>
  delivery.state !== "delivered" &&
  now.getTime() - delivery.createdAt.getTime() < dayMs
