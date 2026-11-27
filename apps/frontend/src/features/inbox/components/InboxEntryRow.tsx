import { useAtomValue } from "@effect/atom-react"
import type { ExcerptPart, InboxEntry, ProjectStatus } from "@pp/shared"
import { AtSign, UserPlus } from "@pp/ui/icons"
import { Inbox } from "@pp/ui/inbox"
import { ItemLink } from "@pp/ui/item-link"
import { TicketKey } from "@pp/ui/ticket-key"
import { Link } from "@tanstack/react-router"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { memo } from "react"

import type { InboxRequest } from "@/features/inbox/atoms/inbox"
import { InboxActorMark } from "@/features/inbox/components/InboxActorMark"
import { InboxEntryMenu } from "@/features/inbox/components/InboxEntryMenu"
import { compactAge } from "@/features/inbox/lib/age"
import { actorName, eventSummary } from "@/features/inbox/lib/describe"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { statusLabelFor } from "@/features/tickets/lib/ticketMeta"
import { useNow } from "@/lib/relativeTime"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

const NO_STATUSES: ReadonlyArray<ProjectStatus> = []

const reasonGlyph = (entry: InboxEntry) =>
  entry.kind === "mentioned" ? (
    <AtSign strokeWidth={2} />
  ) : entry.kind === "assigned" ? (
    <UserPlus strokeWidth={2} />
  ) : undefined

function Excerpt({ parts }: Readonly<{ parts: ReadonlyArray<ExcerptPart> }>) {
  return parts.map((part, index) =>
    part.kind === "text" ? (
      // oxlint-disable-next-line react/no-array-index-key -- excerpt parts have no identity of their own and never reorder
      <span key={index}>{part.text}</span>
    ) : (
      // oxlint-disable-next-line react/no-array-index-key -- excerpt parts have no identity of their own and never reorder
      <Inbox.Mention key={index}>@{part.handle}</Inbox.Mention>
    )
  )
}

export const InboxEntryRow = memo(function InboxEntryRow({
  req,
  entry,
  resolved,
  selected
}: Readonly<{
  req: InboxRequest
  entry: InboxEntry
  resolved: boolean
  selected: boolean
}>) {
  const { orgSlug } = req.params
  const now = useNow()
  const statuses = useAtomValue(
    statusesFor(statusesRequest(orgSlug, entry.ticket.projectSlug))
  )
  const label = (status: string) =>
    statusLabelFor(
      status,
      AsyncResult.isSuccess(statuses) ? statuses.value : NO_STATUSES
    )
  const actor = actorName(entry.actor)
  const unread = entry.state === "unread"
  const said = entry.excerpt !== null && entry.excerpt.length > 0
  const labelArgs = {
    actor,
    key: entry.ticket.id,
    title: entry.ticket.title
  }
  return (
    <Inbox.Row unread={unread} selected={selected}>
      <ItemLink
        render={
          <Link
            to="/orgs/$orgSlug/inbox"
            params={{ orgSlug }}
            search={{ entry: entry.id }}
          />
        }
        aria-current={selected ? "true" : undefined}
        aria-label={
          unread
            ? m.inbox_entry_label_unread(labelArgs)
            : m.inbox_entry_label(labelArgs)
        }
      />
      <Inbox.Avatar reason={reasonGlyph(entry)}>
        <InboxActorMark actor={entry.actor} />
      </Inbox.Avatar>
      <Inbox.Message>
        <Inbox.Text>
          <Inbox.Actor>{actor}</Inbox.Actor>
          {said && entry.excerpt !== null ? (
            <Inbox.Summary kind="said">
              <Excerpt parts={entry.excerpt} />
            </Inbox.Summary>
          ) : (
            <Inbox.Summary kind="event">
              {eventSummary(entry, label)}
            </Inbox.Summary>
          )}
        </Inbox.Text>
        {entry.eventCount > 1 ? (
          <Inbox.Count>
            {m.inbox_more({ count: entry.eventCount - 1 })}
          </Inbox.Count>
        ) : null}
        <Inbox.Time>
          <time dateTime={entry.latestAt.toISOString()}>
            {compactAge(
              entry.latestAt,
              now,
              getLocale(),
              m.common_time_just_now()
            )}
          </time>
        </Inbox.Time>
      </Inbox.Message>
      <Inbox.Ticket>
        {resolved ? <Inbox.Resolved>{m.inbox_cleared()}</Inbox.Resolved> : null}
        <TicketKey value={entry.ticket.id} />
        <Inbox.Title>{entry.ticket.title}</Inbox.Title>
      </Inbox.Ticket>
      <InboxEntryMenu req={req} entry={entry} />
    </Inbox.Row>
  )
})
