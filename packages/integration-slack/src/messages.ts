import { TicketId, type SlackNotification } from "@pp/shared"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import type { SlackMessage, SlackUnfurl } from "./Client"

const decodeUnknownTicketIdOption = Schema.decodeUnknownOption(TicketId)

const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
const text = (value: string) =>
  escape(value.replaceAll(/[\r\n]/g, " ").slice(0, 500))

export const ticketLink = (
  baseUrl: string,
  orgSlug: string,
  slug: string,
  id: string
) =>
  new URL(
    `/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(slug)}/tickets/${encodeURIComponent(id)}`,
    baseUrl
  ).toString()

export const parseTicketLink = (baseUrl: string, value: string) => {
  const url = URL.parse(value)
  const base = URL.parse(baseUrl)
  if (
    !url ||
    !base ||
    url.origin !== base.origin ||
    url.username ||
    url.password
  )
    return null
  const match =
    /^\/orgs\/([a-z0-9-]+)\/projects\/([a-z0-9-]+)\/tickets\/([A-Z][A-Z0-9]*-[1-9][0-9]*)\/?$/.exec(
      url.pathname
    )
  if (!match) return null
  const id = decodeUnknownTicketIdOption(match[3])
  return Option.isSome(id)
    ? { orgSlug: match[1], slug: match[2], id: id.value }
    : null
}

export const ticketPreview = (
  input: Readonly<{
    id: string
    title: string
    status: string
    assignees: ReadonlyArray<string>
  }>
): SlackUnfurl => ({
  blocks: [
    {
      type: "section",
      text: {
        type: "plain_text",
        text: `${input.id} · ${input.title}`.slice(0, 1000)
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "plain_text",
          text: [input.status, input.assignees.join(", ")]
            .filter(Boolean)
            .join(" · ")
            .slice(0, 1000)
        }
      ]
    }
  ]
})

const actions = {
  ticket_created: "created",
  ticket_completed: "completed",
  ticket_reopened: "reopened",
  sprint_started: "started",
  sprint_completed: "completed",
  test: "tested"
} satisfies Readonly<Record<SlackNotification["kind"], string>>

export const notificationMessage = (
  input: Readonly<{
    notification: SlackNotification
    actor: string
    url: string
    statusLabel: string | null
  }>
): SlackMessage => {
  const event = input.notification
  const title =
    event.kind === "test" ? event.title : `${event.id} · ${event.title}`
  return {
    text: escape(
      `${input.actor} ${actions[event.kind]} ${title}\n${input.url}`.slice(
        0,
        2000
      )
    ),
    blocks: [
      {
        type: "section",
        text: {
          type: "plain_text",
          text: `${input.actor} ${actions[event.kind]} ${title}`.slice(0, 1000)
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${input.statusLabel ? `${text(input.statusLabel)} · ` : ""}<${input.url}|Open in ProjectProject>`
        }
      }
    ]
  }
}
