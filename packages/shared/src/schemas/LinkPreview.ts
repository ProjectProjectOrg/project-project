import * as Schema from "effect/Schema"

export const LINK_PREVIEW_URL_MAX = 2048

export const LinkPreviewQuery = Schema.Struct({
  url: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.isMaxLength(LINK_PREVIEW_URL_MAX))
  )
})
export type LinkPreviewQuery = typeof LinkPreviewQuery.Type

export const LinkPreview = Schema.Struct({
  url: Schema.String,
  title: Schema.NullOr(Schema.String),
  faviconUrl: Schema.NullOr(Schema.String)
})
export type LinkPreview = typeof LinkPreview.Type
