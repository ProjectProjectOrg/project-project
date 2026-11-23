import * as Atom from "effect/reactivity/Atom"

import { query } from "@/api/query"

export type LinkPreviewRequest = Readonly<{
  query: Readonly<{ url: string }>
}>

export const linkPreviewRequest = (url: string) => ({
  query: { url }
})

const linkPreviewQuery = (req: LinkPreviewRequest) =>
  query("linkPreviews", "get", {
    query: req.query
  })

export const linkPreview = Atom.family((req: LinkPreviewRequest) =>
  linkPreviewQuery(req)
)
