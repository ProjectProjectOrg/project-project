import { MdastExtension, type MdastImportHandler } from "@lexical/mdast"
import {
  figmaSrc,
  figmaViewParams,
  parseFigmaUrl,
  withFigmaParams
} from "@pp/shared"
import { configExtension, defineExtension } from "lexical"
import type { Link } from "mdast"

import { plainText } from "../markdown-extension"
import { $createFigmaNode, $isFigmaNode, FigmaNode } from "./figma-node"

const $importFigma: MdastImportHandler<Link> = (node, context) => {
  const ref = parseFigmaUrl(node.url)
  return ref === null
    ? context.next()
    : $createFigmaNode({
        url: figmaSrc(node.url),
        label: plainText(node),
        ref,
        density: figmaViewParams(node.url).density
      })
}

export const FigmaExtension = defineExtension({
  name: "@pp/figma",
  nodes: [FigmaNode],
  dependencies: [
    configExtension(MdastExtension, {
      importRules: [{ type: "link", $import: $importFigma }],
      exportRules: [
        {
          type: FigmaNode,
          $export: (node) =>
            $isFigmaNode(node)
              ? {
                  type: "link",
                  url: withFigmaParams(node.getUrl(), {
                    density: node.getDensity()
                  }),
                  children: [{ type: "text", value: node.getLabel() }]
                }
              : null
        }
      ]
    })
  ]
})
