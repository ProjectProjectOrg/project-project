import { defineExtension } from "lexical"

import { AttachmentNode } from "./AttachmentNode"

export const AttachmentExtension = defineExtension({
  name: "@pp/attachment",
  nodes: [AttachmentNode]
})
