import { Db } from "@pp/db"
import { type CommandOutcome, commandReceipt } from "@pp/db/schema"
import type { LiveCursor } from "@pp/shared"
import { and, eq, isNull, sql } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { encodeCursor } from "../live/liveCursor"
import { PRIVATE_RECEIPT_KEY, privatePositionOf } from "./PrivateLog"
import * as SyncLog from "./SyncLog"

export type Claim =
  | Readonly<{ kind: "claimed" }>
  | Readonly<{ kind: "pending" }>
  | Readonly<{ kind: "mismatch" }>
  | Readonly<{ kind: "done"; outcome: CommandOutcome; receipt: LiveCursor }>

export type CommandKey = Readonly<{
  userId: string
  operationId: string
}>

const where = (key: CommandKey) =>
  and(
    eq(commandReceipt.userId, key.userId),
    eq(commandReceipt.operationId, key.operationId)
  )

export class CommandReceipts extends Context.Service<
  CommandReceipts,
  Readonly<{
    claim: (key: CommandKey, requestHash: string) => Effect.Effect<Claim>
    complete: (
      key: CommandKey,
      outcome: CommandOutcome
    ) => Effect.Effect<LiveCursor>
    release: (key: CommandKey) => Effect.Effect<void>
  }>
>()("@pp/server-core/sync/CommandReceipts") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const syncLog = yield* SyncLog.SyncLog

  const claim = Effect.fn("CommandReceipts.claim")(function* (
    key: CommandKey,
    requestHash: string
  ) {
    const inserted = yield* db
      .insert(commandReceipt)
      .values({ ...key, requestHash })
      .onConflictDoNothing()
      .returning({ userId: commandReceipt.userId })
    if (inserted.length > 0) return { kind: "claimed" } satisfies Claim
    const [existing] = yield* db.select().from(commandReceipt).where(where(key))
    if (existing === undefined) return { kind: "pending" } satisfies Claim
    if (existing.requestHash !== requestHash)
      return { kind: "mismatch" } satisfies Claim
    if (existing.outcome === null || existing.receipt === null)
      return { kind: "pending" } satisfies Claim
    return {
      kind: "done",
      outcome: existing.outcome,
      receipt: existing.receipt
    } satisfies Claim
  }, Effect.orDie)

  const complete = Effect.fn("CommandReceipts.complete")(function* (
    key: CommandKey,
    outcome: CommandOutcome
  ) {
    const positions = new Map(yield* syncLog.positionsOf(key.operationId))
    const own = yield* privatePositionOf(key.operationId, key.userId).pipe(
      Effect.provideService(Db, db)
    )
    if (own !== null) positions.set(PRIVATE_RECEIPT_KEY, own)
    const receipt = encodeCursor(positions)
    yield* db
      .update(commandReceipt)
      .set({ outcome, receipt, completedAt: sql`now()` })
      .where(and(where(key), isNull(commandReceipt.outcome)))
    return receipt
  }, Effect.orDie)

  const release = Effect.fn("CommandReceipts.release")(function* (
    key: CommandKey
  ) {
    yield* db
      .delete(commandReceipt)
      .where(and(where(key), isNull(commandReceipt.outcome)))
  }, Effect.orDie)

  return CommandReceipts.of({ claim, complete, release })
})

export const layer = Layer.effect(CommandReceipts, make)
