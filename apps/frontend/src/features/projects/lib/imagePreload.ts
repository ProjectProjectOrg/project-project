const pending = new Map<string, Promise<void>>()

export const preloadImage = (url: string): Promise<void> => {
  if (typeof window === "undefined" || typeof Image === "undefined")
    return Promise.resolve()

  const existing = pending.get(url)
  if (existing) return existing

  const promise = new Promise<void>((resolve) => {
    const img = new Image()
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    img.crossOrigin = "anonymous"
    img.onload = () => {
      if (typeof img.decode === "function") {
        img.decode().then(finish, finish)
      } else finish()
    }
    img.onerror = finish
    img.src = url
  })

  pending.set(url, promise)
  return promise
}
