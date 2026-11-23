import { deferredComponent } from "@/lib/deferredComponent"

export const { Component: Markdown, preload: loadMarkdown } = deferredComponent(
  () => import("@pp/ui/editor/markdown").then((mod) => mod.Markdown)
)
