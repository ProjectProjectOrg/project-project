import * as schema from "@pp/db/schema"
import { user, userSettings } from "@pp/db/schema"
import { eq } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"

import { providerAvatar } from "./providerAvatar"

type Db = NodePgDatabase<typeof schema.relations>

const chosenSource = async (db: Db, userId: string) =>
  (
    await db.query.userSettings.findFirst({
      columns: { avatarSource: true },
      where: { userId }
    })
  )?.avatarSource ?? null

const refreshChosenAvatar = async (db: Db, accountRowId: string) => {
  const account = await db.query.account.findFirst({
    columns: { userId: true, providerId: true, accountId: true, idToken: true },
    where: { id: accountRowId }
  })
  const chosen = account ? providerAvatar(account) : null
  if (!account || !chosen) return
  if ((await chosenSource(db, account.userId)) !== chosen.source) return
  await db
    .update(user)
    .set({ image: chosen.image })
    .where(eq(user.id, account.userId))
}

const releaseUnlinkedAvatar = async (
  db: Db,
  account: Readonly<{ userId: string; providerId: string }>
) => {
  if ((await chosenSource(db, account.userId)) !== account.providerId) return
  await db.transaction(async (tx) => {
    await tx
      .update(userSettings)
      .set({ avatarSource: null })
      .where(eq(userSettings.userId, account.userId))
    await tx
      .update(user)
      .set({ image: null })
      .where(eq(user.id, account.userId))
  })
}

const reportingFailure =
  <A>(label: string, run: (input: A) => Promise<void>) =>
  async (input: A) => {
    try {
      await run(input)
    } catch (cause) {
      process.stderr.write(`[avatar-sync] ${label} failed: ${String(cause)}\n`)
    }
  }

export const avatarSyncHooks = (db: Db) => {
  const refresh = reportingFailure("refresh", (account: { id: string }) =>
    refreshChosenAvatar(db, account.id)
  )
  return {
    create: { after: refresh },
    update: { after: refresh },
    delete: {
      after: reportingFailure(
        "release",
        (account: Readonly<{ userId: string; providerId: string }>) =>
          releaseUnlinkedAvatar(db, account)
      )
    }
  }
}
