import type { LinkPreview } from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export type LinkPreviewsShape = Readonly<{
  get: (url: string) => Effect.Effect<LinkPreview>
}>

export class LinkPreviews extends Context.Service<
  LinkPreviews,
  LinkPreviewsShape
>()("@pp/server-core/linkPreviews/LinkPreviews") {}
