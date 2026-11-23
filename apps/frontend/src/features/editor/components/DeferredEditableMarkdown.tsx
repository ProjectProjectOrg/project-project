import { deferredComponent } from "@/lib/deferredComponent"

export const { Component: EditableMarkdown, preload: loadEditableMarkdown } =
  deferredComponent(() =>
    import("./EditableMarkdown").then((mod) => mod.EditableMarkdown)
  )
