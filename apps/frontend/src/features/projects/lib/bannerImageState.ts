export type BannerImageSize = Readonly<{ width: number; height: number }>

export type BannerImageState<I> = Readonly<{
  lookup: "idle" | "pending" | "settled"
  cachedRender: string | null
  naturalSize: BannerImageSize | null
  shaderImage: I | null
  painted: boolean
  placeholderFailed: boolean
  shaderFailed: boolean
}>

export type BannerImageEvent<I> =
  | Readonly<{ type: "lookupSkipped" }>
  | Readonly<{ type: "lookupStarted" }>
  | Readonly<{ type: "lookupHit"; url: string }>
  | Readonly<{ type: "lookupMissed" }>
  | Readonly<{ type: "imageLoaded"; size: BannerImageSize }>
  | Readonly<{ type: "imageDecoded"; image: I }>
  | Readonly<{ type: "decodeFailed" }>
  | Readonly<{ type: "imageFailed" }>
  | Readonly<{ type: "painted" }>

export const initialBannerImageState: BannerImageState<never> = {
  lookup: "idle",
  cachedRender: null,
  naturalSize: null,
  shaderImage: null,
  painted: false,
  placeholderFailed: false,
  shaderFailed: false
}

export const bannerImageReducer = <I>(
  state: BannerImageState<I>,
  event: BannerImageEvent<I>
): BannerImageState<I> => {
  switch (event.type) {
    case "lookupSkipped":
      return { ...state, lookup: "settled" }
    case "lookupStarted":
      return { ...state, lookup: "pending", cachedRender: null }
    case "lookupHit":
      return { ...state, lookup: "settled", cachedRender: event.url }
    case "lookupMissed":
      return { ...state, lookup: "settled" }
    case "imageLoaded":
      return { ...state, naturalSize: event.size }
    case "imageDecoded":
      return { ...state, shaderImage: event.image }
    case "decodeFailed":
      return { ...state, shaderFailed: true }
    case "imageFailed":
      return { ...state, placeholderFailed: true }
    case "painted":
      return state.painted ? state : { ...state, painted: true }
    default:
      return state
  }
}

export const shouldLoadBannerImage = (
  state: BannerImageState<unknown>,
  editing: boolean
): boolean =>
  state.lookup === "settled" && (state.cachedRender === null || editing)
