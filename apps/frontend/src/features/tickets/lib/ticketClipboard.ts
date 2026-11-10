import type { TicketDetail } from "@pp/shared"

type Copied = Pick<TicketDetail, "id" | "title" | "body">

export type TicketLocation = Readonly<{
  orgSlug: string
  slug: string
}>

export const ticketUrl = (
  { orgSlug, slug }: TicketLocation,
  id: TicketDetail["id"]
): string =>
  `${window.location.origin}/orgs/${orgSlug}/projects/${slug}/tickets/${id}`

const withBody = (head: string, body: string) =>
  body.trim() === "" ? head : `${head}\n\n${body.trim()}`

export const ticketMarkdown = (ticket: Copied, url: string): string =>
  withBody(`# [${ticket.id}](${url}) ${ticket.title}`, ticket.body)

export const ticketPrompt = (
  ticket: Copied,
  url: string,
  { orgSlug, slug }: TicketLocation
): string =>
  [
    withBody(
      `Work on ticket ${ticket.id}: ${ticket.title}\n${url}`,
      ticket.body
    ),
    `If you have the ProjectProject MCP tools, read the ticket with \`get_ticket\` (orgSlug \`${orgSlug}\`, projectSlug \`${slug}\`, id \`${ticket.id}\`) and follow the steps for working on a ticket.`
  ].join("\n\n")
