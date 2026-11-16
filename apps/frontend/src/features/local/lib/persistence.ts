import {
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase
} from "@tanstack/browser-db-sqlite-persistence"
import * as Effect from "effect/Effect"

export type LocalPersistence = ReturnType<
  typeof createBrowserWASQLitePersistence
>

const open = async (userId: string): Promise<LocalPersistence | null> => {
  try {
    const database = await openBrowserWASQLiteOPFSDatabase({
      databaseName: `pp-${userId}.sqlite`
    })
    const coordinator = new BrowserCollectionCoordinator({
      dbName: `pp-${userId}`
    })
    return createBrowserWASQLitePersistence({ database, coordinator })
  } catch (error) {
    Effect.runFork(
      Effect.logWarning(
        "[local] persistence unavailable, keeping tickets in memory",
        error
      )
    )
    return null
  }
}

const opened = new Map<string, Promise<LocalPersistence | null>>()

export const persistenceFor = (userId: string) => {
  const known = opened.get(userId)
  if (known !== undefined) return known
  const opening = open(userId)
  opened.set(userId, opening)
  return opening
}
