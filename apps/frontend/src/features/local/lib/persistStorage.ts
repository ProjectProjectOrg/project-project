import * as Effect from "effect/Effect"

const ASKED_KEY = "pp:persist-asked"

const asked = () => {
  try {
    return window.localStorage.getItem(ASKED_KEY) !== null
  } catch {
    return true
  }
}

const markAsked = () => {
  try {
    window.localStorage.setItem(ASKED_KEY, "1")
  } catch {
    return
  }
}

export const persistStorageOnce = Effect.promise(async () => {
  if (!("storage" in navigator)) return
  const storage = navigator.storage
  try {
    if ((await storage.persisted()) || asked()) return
    markAsked()
    await storage.persist()
  } catch {
    return
  }
})
