export type BannerRenderVariant = "header" | "card" | "row"

export type BannerRenderIdentity = Readonly<{
  project: string
  source: string
  variant: BannerRenderVariant
  crop: Readonly<{ x: number; y: number; zoom: number }>
  pixelRatio: number
}>

export type BannerRenderKey = BannerRenderIdentity &
  Readonly<{ width: number; height: number }>

export type ReadyBannerRender = Readonly<{
  key: BannerRenderKey
  url: string
  image: HTMLImageElement
}>

export type BannerRenderLease = Readonly<{
  render: ReadyBannerRender
  release: () => void
}>

type RenderEntry = Readonly<{
  render: ReadyBannerRender
  leases: Set<symbol>
}>

const CACHE_NAME = "banner-renders-v1"
const KEY_ORIGIN = "https://banner-render.invalid"
const CROP_PRECISION = 4
const MEMORY_LIMIT = 24
const memory = new Map<string, RenderEntry>()
const resources = new Map<string, RenderEntry>()
const generations = new Map<string, symbol>()
const mutations = new Map<string, Promise<void>>()
const roundCrop = (value: number) => value.toFixed(CROP_PRECISION)

export const BANNER_RENDER_WIDTH_STEP = 128

export const bucketRenderWidth = (width: number): number =>
  Math.max(
    BANNER_RENDER_WIDTH_STEP,
    Math.ceil(width / BANNER_RENDER_WIDTH_STEP) * BANNER_RENDER_WIDTH_STEP
  )

const projectScope = (project: string) =>
  `${KEY_ORIGIN}/${encodeURIComponent(project)}/`

const scopeOf = (key: BannerRenderIdentity): string =>
  `${projectScope(key.project)}${key.variant}`

export const bannerRenderGeneration = (project: string): symbol => {
  const current = generations.get(project)
  if (current) return current
  const generation = Symbol(project)
  generations.set(project, generation)
  return generation
}

const isCurrent = (project: string, generation: symbol) =>
  generations.get(project) === generation

const dispose = (entry: RenderEntry) => {
  if (entry.leases.size > 0 || memory.get(scopeOf(entry.render.key)) === entry)
    return
  resources.delete(entry.render.url)
  URL.revokeObjectURL(entry.render.url)
}

const matchesIdentity = (
  key: BannerRenderIdentity,
  identity: BannerRenderIdentity
) =>
  scopeOf(key) === scopeOf(identity) &&
  key.source === identity.source &&
  key.pixelRatio === identity.pixelRatio &&
  roundCrop(key.crop.x) === roundCrop(identity.crop.x) &&
  roundCrop(key.crop.y) === roundCrop(identity.crop.y) &&
  roundCrop(key.crop.zoom) === roundCrop(identity.crop.zoom)

export const matchesBannerRender = (
  url: string,
  identity: BannerRenderIdentity
): boolean => {
  const entry = resources.get(url)
  return entry !== undefined && matchesIdentity(entry.render.key, identity)
}

export const peekBannerRender = (
  identity: BannerRenderIdentity
): ReadyBannerRender | null => {
  const entry = memory.get(scopeOf(identity))
  if (!entry) return null
  return matchesIdentity(entry.render.key, identity) ? entry.render : null
}

export const retainBannerRender = (url: string): (() => void) => {
  const entry = resources.get(url)
  if (!entry) return () => undefined
  const lease = Symbol()
  entry.leases.add(lease)
  const scope = scopeOf(entry.render.key)
  if (memory.get(scope) === entry) {
    memory.delete(scope)
    memory.set(scope, entry)
  }
  return () => {
    entry.leases.delete(lease)
    dispose(entry)
  }
}

export const bannerRenderUrl = (key: BannerRenderKey): string => {
  const params = new URLSearchParams({
    src: key.source,
    x: roundCrop(key.crop.x),
    y: roundCrop(key.crop.y),
    z: roundCrop(key.crop.zoom),
    w: String(bucketRenderWidth(key.width)),
    h: String(key.height),
    dpr: String(key.pixelRatio)
  })
  return `${scopeOf(key)}?${params.toString()}`
}

let opening: Promise<Cache | null> | null = null
let clearing: Promise<void> | null = null

const openCache = async (): Promise<Cache | null> => {
  if (clearing) await clearing
  if (typeof caches === "undefined") return null
  opening ??= caches.open(CACHE_NAME).catch(() => null)
  return opening
}

const mutateCache = (project: string, action: () => Promise<void>) => {
  const previous = mutations.get(project) ?? Promise.resolve()
  const next = previous.then(action).catch(() => undefined)
  mutations.set(project, next)
  void next.then(() => {
    if (mutations.get(project) === next) mutations.delete(project)
  })
  return next
}

export const resetBannerRenderCacheHandle = () => {
  opening = null
}

export const clearBannerRenderCache = async (): Promise<void> => {
  generations.clear()
  const entries = [...memory.values()]
  memory.clear()
  for (const entry of entries) dispose(entry)
  const pending = [...mutations.values()]
  const previous = clearing
  opening = null
  const clear = async () => {
    await previous
    await Promise.all(pending)
    try {
      if (typeof caches !== "undefined") await caches.delete(CACHE_NAME)
    } catch {
      return
    }
  }
  const operation = clear()
  clearing = operation
  await operation
  if (clearing === operation) clearing = null
}

export const evictBannerRenders = async (project: string): Promise<void> => {
  generations.delete(project)
  for (const [scope, entry] of memory) {
    if (entry.render.key.project !== project) continue
    memory.delete(scope)
    dispose(entry)
  }
  const openingCache = openCache()
  await mutateCache(project, async () => {
    const cache = await openingCache
    if (!cache) return
    const stale = (await cache.keys()).filter((request) =>
      request.url.startsWith(projectScope(project))
    )
    await Promise.all(stale.map((request) => cache.delete(request.url)))
  })
}

export const readBannerRender = async (
  key: BannerRenderKey,
  generation = bannerRenderGeneration(key.project)
): Promise<Blob | null> => {
  const cache = await openCache()
  if (!cache || !isCurrent(key.project, generation)) return null
  try {
    const hit = await cache.match(bannerRenderUrl(key))
    const blob = hit ? await hit.blob() : null
    return isCurrent(key.project, generation) ? blob : null
  } catch {
    return null
  }
}

export const prepareBannerRender = async (
  key: BannerRenderKey,
  blob: Blob,
  generation = bannerRenderGeneration(key.project)
): Promise<BannerRenderLease | null> => {
  if (!isCurrent(key.project, generation)) return null
  const url = URL.createObjectURL(blob)
  const image = new Image()
  image.src = url
  try {
    await image.decode()
  } catch {
    URL.revokeObjectURL(url)
    return null
  }
  if (!isCurrent(key.project, generation)) {
    URL.revokeObjectURL(url)
    return null
  }
  const existing = peekBannerRender(key)
  if (existing && bannerRenderUrl(existing.key) === bannerRenderUrl(key)) {
    URL.revokeObjectURL(url)
    return { render: existing, release: retainBannerRender(existing.url) }
  }
  const render = { key, url, image }
  const entry: RenderEntry = { render, leases: new Set() }
  const scope = scopeOf(key)
  const previous = memory.get(scope)
  memory.delete(scope)
  memory.set(scope, entry)
  resources.set(url, entry)
  const release = retainBannerRender(url)
  if (previous) dispose(previous)
  while (memory.size > MEMORY_LIMIT) {
    const oldest = memory.entries().next().value
    if (!oldest) break
    memory.delete(oldest[0])
    dispose(oldest[1])
  }
  return { render, release }
}

export const readReadyBannerRender = async (
  key: BannerRenderKey,
  generation = bannerRenderGeneration(key.project)
): Promise<BannerRenderLease | null> => {
  const existing = peekBannerRender(key)
  if (existing && bannerRenderUrl(existing.key) === bannerRenderUrl(key))
    return { render: existing, release: retainBannerRender(existing.url) }
  const blob = await readBannerRender(key, generation)
  return blob ? prepareBannerRender(key, blob, generation) : null
}

export const writeBannerRender = async (
  key: BannerRenderKey,
  rendered: Blob,
  generation = bannerRenderGeneration(key.project)
): Promise<void> => {
  const openingCache = openCache()
  await mutateCache(key.project, async () => {
    const cache = await openingCache
    if (!cache || !isCurrent(key.project, generation)) return
    const body = await rendered.arrayBuffer()
    if (!isCurrent(key.project, generation)) return
    const url = bannerRenderUrl(key)
    await cache.put(
      url,
      new Response(body, { headers: { "content-type": rendered.type } })
    )
    if (!isCurrent(key.project, generation)) return
    const scope = `${scopeOf(key)}?`
    const superseded = (await cache.keys()).filter(
      (request) => request.url.startsWith(scope) && request.url !== url
    )
    await Promise.all(superseded.map((request) => cache.delete(request.url)))
  })
}
