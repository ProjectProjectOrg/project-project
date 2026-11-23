import { PgClient } from "@effect/sql-pg"
import { ProjectChange, TicketId } from "@pp/shared"
import type { Done } from "effect/Cause"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Latch from "effect/Latch"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Queue from "effect/Queue"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"

const channel = "project_sync"
const accountLimit = 32
const pendingLimit = 64
const batchWindow = Duration.millis(50)

const decodeProject = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ project: Schema.String }))
)
const decodeChange = Schema.decodeUnknownOption(
  Schema.fromJsonString(ProjectChange)
)
const decodeNotification = (payload: string) =>
  Option.all({
    project: Option.map(decodeProject(payload), ({ project }) => project),
    change: decodeChange(payload)
  })

const everything = { kind: "project", id: null } satisfies ProjectChange
const changeKey = ({ kind, id }: ProjectChange) => `${kind}/${id ?? ""}`

type Subscriber = Readonly<{
  wake: Queue.Queue<void, Done>
  pending: Map<string, ProjectChange>
}>

const collect = ({ pending }: Subscriber, change: ProjectChange) => {
  if (pending.has(changeKey(everything))) return
  if (change.kind === "project" || pending.size >= pendingLimit) {
    pending.clear()
    pending.set(changeKey(everything), everything)
    return
  }
  pending.set(changeKey(change), change)
}

const drain = ({ pending }: Subscriber) => {
  const changes = [...pending.values()]
  pending.clear()
  return changes
}

export class TicketEvents extends Context.Service<
  TicketEvents,
  Readonly<{
    subscribe: (
      projectId: string,
      account: string
    ) => Effect.Effect<
      Stream.Stream<ReadonlyArray<ProjectChange>> | null,
      never,
      Scope.Scope
    >
  }>
>()("@pp/backend/tickets/TicketEvents") {}

const make = Effect.gen(function* () {
  const pg = yield* PgClient.PgClient
  const listening = yield* Latch.make()
  const projects = new Map<string, Set<Subscriber>>()
  const accounts = new Map<string, number>()

  const expand = Effect.fn("TicketEvents.expand")(function* (
    project: string,
    changes: ReadonlyArray<ProjectChange>
  ) {
    const ids = changes.flatMap(({ kind, id }) =>
      kind === "tickets" && id !== null ? [id] : []
    )
    if (ids.length === 0) return changes
    const peers = yield* pg<{ id: string }>`
      SELECT parent AS id FROM ticket_index
      WHERE project_id = ${project} AND ticket_id IN ${pg.in(ids)} AND parent IS NOT NULL
      UNION SELECT ticket_id FROM ticket_index
      WHERE project_id = ${project} AND parent IN ${pg.in(ids)}
      UNION SELECT to_ticket_id FROM ticket_relation_index
      WHERE project_id = ${project} AND from_ticket_id IN ${pg.in(ids)}
      UNION SELECT from_ticket_id FROM ticket_relation_index
      WHERE project_id = ${project} AND to_ticket_id IN ${pg.in(ids)}
    `
    const known = new Set(ids)
    const expanded = [...changes]
    for (const row of peers) {
      const id = TicketId.make(row.id)
      if (!known.has(id)) expanded.push({ kind: "tickets", id })
    }
    return expanded
  })

  const subscribe = Effect.fn("TicketEvents.subscribe")(function* (
    projectId: string,
    account: string
  ) {
    const subscriber: Subscriber = {
      wake: yield* Queue.sliding<void, Done>(1),
      pending: new Map()
    }
    yield* listening.await
    const registered = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const streams = accounts.get(account) ?? 0
        if (streams >= accountLimit) return false
        accounts.set(account, streams + 1)
        const subscribers = projects.get(projectId) ?? new Set<Subscriber>()
        projects.set(projectId, subscribers)
        subscribers.add(subscriber)
        return true
      }),
      (registered) =>
        Effect.sync(() => {
          if (!registered) return
          const streams = accounts.get(account) ?? 1
          if (streams === 1) accounts.delete(account)
          else accounts.set(account, streams - 1)
          const subscribers = projects.get(projectId)
          subscribers?.delete(subscriber)
          if (subscribers?.size === 0) projects.delete(projectId)
          Queue.shutdownUnsafe(subscriber.wake)
        })
    )
    if (!registered) return null
    return Stream.fromQueue(subscriber.wake).pipe(
      Stream.mapEffect(() =>
        Effect.sleep(batchWindow).pipe(
          Effect.andThen(() => expand(projectId, drain(subscriber))),
          Effect.catch(() => Effect.succeed([everything]))
        )
      ),
      Stream.filter((changes) => changes.length > 0)
    )
  })

  const disconnect = () => {
    listening.closeUnsafe()
    for (const subscribers of projects.values())
      for (const subscriber of subscribers) Queue.endUnsafe(subscriber.wake)
  }
  const listen = Effect.gen(function* () {
    const notifications = yield* pg.listen(channel)
    listening.openUnsafe()
    return yield* Effect.forever(
      Effect.flatMap(Queue.take(notifications), ({ payload }) =>
        Option.match(decodeNotification(payload), {
          onNone: () =>
            Effect.logWarning("Ignoring malformed project notification", {
              payload
            }),
          onSome: ({ project, change }) =>
            Effect.sync(() => {
              for (const subscriber of projects.get(project) ?? []) {
                collect(subscriber, change)
                Queue.offerUnsafe(subscriber.wake, undefined)
              }
            })
        })
      )
    )
  }).pipe(
    Effect.scoped,
    Effect.tapError((error) =>
      Effect.sync(disconnect).pipe(
        Effect.andThen(
          Effect.logWarning("Ticket notification listener disconnected", error)
        )
      )
    ),
    Effect.retry(
      Schedule.exponential("250 millis").pipe(
        Schedule.modifyDelay(({ duration }) =>
          Effect.succeed(Duration.min(duration, Duration.seconds(10)))
        ),
        Schedule.jittered
      )
    ),
    Effect.forkScoped
  )
  yield* listen
  return TicketEvents.of({ subscribe })
})

export const layer = Layer.effect(TicketEvents, make)
