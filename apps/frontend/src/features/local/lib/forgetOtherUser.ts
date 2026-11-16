import * as Effect from "effect/Effect"

const LAST_USER = "pp:local-user"

const swapLastUser = (userId: string) => {
  try {
    const previous = window.localStorage.getItem(LAST_USER)
    window.localStorage.setItem(LAST_USER, userId)
    return previous
  } catch {
    return null
  }
}

export const forgetOtherUser = (userId: string) =>
  Effect.promise(async () => {
    const previous = swapLastUser(userId)
    if (previous === null || previous === userId || !("storage" in navigator))
      return
    const local = await navigator.storage
      .getDirectory()
      .then((root) => root.getDirectoryHandle("local"))
      .catch(() => null)
    for (const suffix of ["", "-journal", "-wal"])
      await local
        ?.removeEntry(`pp-${previous}.sqlite${suffix}`)
        .catch(() => undefined)
  })
