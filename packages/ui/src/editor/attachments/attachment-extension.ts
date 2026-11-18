import { defineExtension } from "lexical"

import { AttachmentNode } from "./attachment-node"

export const AttachmentExtension = defineExtension({
  name: "@pp/attachment",
  nodes: [AttachmentNode]
})
