import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $insertNodes, COMMAND_PRIORITY_HIGH, PASTE_COMMAND } from "lexical"
import { useEffect } from "react"

import { m } from "../messages"
import { $createPaperNode } from "./paper-node"
import { isPaperDesignUrl } from "./paper-url"

export function PaperPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(
    () =>
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          if (!(event instanceof ClipboardEvent)) return false
          if (event.clipboardData?.files.length) return false

          const text = event.clipboardData?.getData("text/plain")?.trim()
          if (!text || /\s/.test(text) || !isPaperDesignUrl(text)) return false

          event.preventDefault()
          editor.update(() => {
            $insertNodes([
              $createPaperNode({
                url: text,
                label: m.editor_paper_default_name()
              })
            ])
          })
          return true
        },
        COMMAND_PRIORITY_HIGH
      ),
    [editor]
  )

  return null
}
