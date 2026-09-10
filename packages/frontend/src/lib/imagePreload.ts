const pending = new Map<string, Promise<void>>()
const loaded = new Set<string>()

export const preloadImage = (url: string): Promise<void> => {
  if (typeof window === "undefined" || typeof Image === "undefined")
    return Promise.resolve()

  const existing = pending.get(url)
  if (existing) return existing

  const promise = new Promise<void>((resolve) => {
    const img = new Image()
    let settled = false
    const finish = (success: boolean) => {
      if (settled) return
      settled = true
      if (success) loaded.add(url)
      resolve()
    }
    img.onload = () => {
      if (typeof img.decode === "function") {
        img.decode().then(
          () => finish(true),
          () => finish(true)
        )
      } else finish(true)
    }
    img.onerror = () => finish(false)
    img.src = url
  })

  pending.set(url, promise)
  return promise
}

export const isImageLoaded = (url: string): boolean => loaded.has(url)
