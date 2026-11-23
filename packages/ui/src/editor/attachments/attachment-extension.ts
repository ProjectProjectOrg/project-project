import { MdastExtension } from "@lexical/mdast"
import { configExtension, defineExtension } from "lexical"

import { $exportAttachment, $importAttachment } from "./attachment-markdown"
import { AttachmentNode } from "./attachment-node"

export const AttachmentExtension = defineExtension({
  name: "@pp/attachment",
  nodes: [AttachmentNode],
  dependencies: [
    configExtension(MdastExtension, {
      importRules: [
        { type: "image", $import: $importAttachment },
        { type: "link", $import: $importAttachment }
      ],
      exportRules: [{ type: AttachmentNode, $export: $exportAttachment }],
      inlineShortcutTypes: ["image"]
    })
  ]
})
