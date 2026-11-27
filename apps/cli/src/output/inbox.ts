import { InboxEntry } from "@pp/shared"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

const decodeEntry = Schema.decodeUnknownOption(Schema.toEncoded(InboxEntry))

type Entry = typeof InboxEntry.Encoded

const actorName = (actor: Entry["actor"]) => {
  if (actor === null) return "Someone"
  if (actor.kind === "user") return actor.user.name
  if (actor.kind === "agent") return `${actor.user.name} (${actor.client.name})`
  if (actor.kind === "system") return actor.source
  return actor.displayName
}

const excerptText = (excerpt: Entry["excerpt"]) =>
  excerpt === null
    ? null
    : excerpt
        .map((part) => (part.kind === "text" ? part.text : `@${part.handle}`))
        .join("")

const happened = (event: Entry["latest"]) =>
  Match.value(event).pipe(
    Match.discriminatorsExhaustive("kind")({
      assigned: () => "assigned you",
      mentioned: () => "mentioned you",
      commented: () => "commented",
      status_changed: ({ from, to }) => `moved it from ${from} to ${to}`,
      unblocked: ({ by }) => `${by} no longer blocks it`,
      archived: () => "archived it",
      moved: ({ fromProject, fromId }) =>
        `moved it here from ${fromProject} (${fromId})`,
      split: ({ into }) => `split it into ${into.join(", ")}`,
      reassigned: () => "changed its assignees"
    })
  )

const present = (entry: Entry) => ({
  ticket: `${entry.ticket.id} ${entry.ticket.title}`,
  project: entry.ticket.projectSlug,
  kind: entry.kind,
  state: entry.state,
  from: actorName(entry.actor),
  did: happened(entry.latest),
  at: entry.latestAt,
  said: excerptText(entry.excerpt),
  id: entry.id,
  revision: entry.revision
})

export const presentInboxEntry = (item: unknown) =>
  Option.match(decodeEntry(item), {
    onNone: () => item,
    onSome: present
  })
