import * as Atom from "effect/reactivity/Atom"

import { query } from "@/api/query"

export type LinkPreviewRequest = Readonly<{
  query: Readonly<{ url: string }>
}>

export const linkPreviewRequest = (url: string): LinkPreviewRequest => ({
  query: { url }
})

const linkPreviewQuery = (req: LinkPreviewRequest) =>
  query("linkPreviews", "get", {
    query: req.query,
    timeToLive: "1 hour"
  })

export const linkPreview = Atom.family((req: LinkPreviewRequest) =>
  linkPreviewQuery(req)
)
