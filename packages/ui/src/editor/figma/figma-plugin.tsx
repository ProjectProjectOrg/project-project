import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { figmaSrc, parseFigmaUrl } from "@pp/shared"
import {
  $insertNodes,
  $nodesOfType,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND
} from "lexical"
import { useEffect, type JSX } from "react"

import type { FigmaTicketLinksRequest } from "@/features/figma/atoms/figma"

import { figmaSlugLabel } from "./FigmaChip"
import { $createFigmaNode, FigmaNode } from "./FigmaNode"

export function FigmaPlugin({
  request
}: {
  request: FigmaTicketLinksRequest | null
}): JSX.Element | null {
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
