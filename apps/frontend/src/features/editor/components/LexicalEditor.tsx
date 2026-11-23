import { deferredComponent } from "@/lib/deferredComponent"

export const { Component: LexicalEditor, preload: loadLexicalEditor } =
  deferredComponent(() =>
    import("@pp/ui/editor/lexical-editor").then((mod) => mod.LexicalEditor)
  )
