export type BannerRenderVariant = "header" | "card" | "row"

export type BannerRenderKey = {
  readonly project: string
  readonly source: string
  readonly variant: BannerRenderVariant
  readonly crop: {
    readonly x: number
    readonly y: number
    readonly zoom: number
  }
  readonly width: number
  readonly pixelRatio: number
}

const CACHE_NAME = "banner-renders-v1"
const KEY_ORIGIN = "https://banner-render.invalid"
const CROP_PRECISION = 4

export const BANNER_RENDER_WIDTH_STEP = 128

export const bucketRenderWidth = (width: number): number =>
  Math.max(
    BANNER_RENDER_WIDTH_STEP,
    Math.ceil(width / BANNER_RENDER_WIDTH_STEP) * BANNER_RENDER_WIDTH_STEP
  )

const scopeOf = (key: BannerRenderKey): string =>
  `${KEY_ORIGIN}/${encodeURIComponent(key.project)}/${key.variant}`

export const bannerRenderUrl = (key: BannerRenderKey): string => {
  const round = (value: number) => value.toFixed(CROP_PRECISION)
  const params = new URLSearchParams({
    src: key.source,
    x: round(key.crop.x),
    y: round(key.crop.y),
    z: round(key.crop.zoom),
    w: String(bucketRenderWidth(key.width)),
    dpr: String(key.pixelRatio)
  })
  return `${scopeOf(key)}?${params.toString()}`
}

let opening: Promise<Cache | null> | null = null

const openCache = (): Promise<Cache | null> => {
  if (typeof caches === "undefined") return Promise.resolve(null)
  opening ??= caches.open(CACHE_NAME).catch(() => null)
  return opening
}

export const resetBannerRenderCacheHandle = () => {
  opening = null
}

export const readBannerRender = async (
  key: BannerRenderKey
): Promise<Blob | null> => {
  const cache = await openCache()
  if (!cache) return null
  try {
    const hit = await cache.match(bannerRenderUrl(key))
    return hit ? await hit.blob() : null
  } catch {
    return null
  }
}

export const writeBannerRender = async (
  key: BannerRenderKey,
  rendered: Blob
): Promise<void> => {
  const cache = await openCache()
  if (!cache) return
  const url = bannerRenderUrl(key)
  try {
    const body = await rendered.arrayBuffer()
    await cache.put(
      url,
      new Response(body, { headers: { "content-type": rendered.type } })
    )
    const scope = `${scopeOf(key)}?`
    const superseded = (await cache.keys()).filter(
      (request) => request.url.startsWith(scope) && request.url !== url
    )
    await Promise.all(superseded.map((request) => cache.delete(request.url)))
  } catch {
    return
  }
}
