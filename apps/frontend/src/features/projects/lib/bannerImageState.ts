import * as Data from "effect/Data"

export type BannerImageSize = Readonly<{ width: number; height: number }>

export type BannerImageState<I> = Readonly<{
  lookup: "idle" | "pending" | "hit" | "miss"
  cachedRender: string | null
  naturalSize: BannerImageSize | null
  shaderImage: I | null
  painted: boolean
  placeholderFailed: boolean
  shaderFailed: boolean
}>

export type BannerImageEvent<I> = Data.TaggedEnum<{
  lookupSkipped: {}
  lookupStarted: {}
  lookupHit: { readonly url: string }
  lookupMissed: {}
  imageLoaded: { readonly size: BannerImageSize }
  imageDecoded: { readonly image: I }
  decodeFailed: {}
  imageFailed: {}
  renderStarted: {}
  painted: {}
}>
interface BannerImageEventDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: BannerImageEvent<this["A"]>
}
export const BannerImageEvent = Data.taggedEnum<BannerImageEventDefinition>()

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
) =>
  BannerImageEvent.$match(event, {
    lookupSkipped: () =>
      ({ ...state, lookup: "miss" }) satisfies BannerImageState<I>,
    lookupStarted: () =>
      ({ ...state, lookup: "pending" }) satisfies BannerImageState<I>,
    lookupHit: ({ url }) =>
      ({
        ...state,
        lookup: "hit",
        cachedRender: url
      }) satisfies BannerImageState<I>,
    lookupMissed: () =>
      ({ ...state, lookup: "miss" }) satisfies BannerImageState<I>,
    imageLoaded: ({ size }) => ({ ...state, naturalSize: size }),
    imageDecoded: ({ image }) => ({ ...state, shaderImage: image }),
    decodeFailed: () => ({ ...state, shaderFailed: true }),
    imageFailed: () => ({ ...state, placeholderFailed: true }),
    renderStarted: () => (state.painted ? { ...state, painted: false } : state),
    painted: () => (state.painted ? state : { ...state, painted: true })
  })

export const shouldLoadBannerImage = (
  state: BannerImageState<unknown>,
  editing: boolean
) => state.lookup === "miss" || editing
