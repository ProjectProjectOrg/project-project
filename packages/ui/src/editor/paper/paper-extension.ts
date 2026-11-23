import { MdastExtension, type MdastImportHandler } from "@lexical/mdast"
import { configExtension, defineExtension } from "lexical"
import type { Link } from "mdast"

import { plainText } from "../markdown-extension"
import { $createPaperNode, $isPaperNode, PaperNode } from "./paper-node"
import { isPaperDesignUrl } from "./paper-url"

const $importPaper: MdastImportHandler<Link> = (node, context) =>
  isPaperDesignUrl(node.url)
    ? $createPaperNode({ url: node.url, label: plainText(node) })
    : context.next()

export const PaperExtension = defineExtension({
  name: "@pp/paper",
  nodes: [PaperNode],
  dependencies: [
    configExtension(MdastExtension, {
      importRules: [{ type: "link", $import: $importPaper }],
      exportRules: [
        {
          type: PaperNode,
          $export: (node) =>
            $isPaperNode(node)
              ? {
                  type: "link",
                  url: node.getUrl(),
                  children: [{ type: "text", value: node.getLabel() }]
                }
              : null
        }
      ]
    })
  ]
})
