import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { figmaSrc, parseFigmaUrl } from "@pp/shared"
import {
  $insertNodes,
  $nodesOfType,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND
} from "lexical"
import { useEffect } from "react"

import type { TicketTarget } from "../services"
import { figmaSlugLabel } from "./figma-chip"
import { $createFigmaNode, FigmaNode } from "./figma-node"

export function FigmaPlugin({ request }: { request: TicketTarget | null }) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    editor.update(() => {
      for (const node of $nodesOfType(FigmaNode)) node.setRequest(request)
    })
  }, [editor, request])

  useEffect(
    () =>
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          if (!(event instanceof ClipboardEvent)) return false
          if (event.clipboardData?.files.length) return false

          const text = event.clipboardData?.getData("text/plain")?.trim()
          if (!text || /\s/.test(text)) return false

          const ref = parseFigmaUrl(text)
          if (ref === null) return false

          const slug = figmaSlugLabel(ref.slug)
          event.preventDefault()
          editor.update(() => {
            $insertNodes([
              $createFigmaNode({
                url: figmaSrc(text),
                label: slug.length > 0 ? slug : text,
                ref,
                density: "compact",
                request
              })
            ])
          })
          return true
        },
        COMMAND_PRIORITY_HIGH
      ),
    [editor, request]
  )

  return null
}
