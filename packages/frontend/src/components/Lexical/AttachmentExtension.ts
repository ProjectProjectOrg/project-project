import { defineExtension } from "lexical"
import { AttachmentNode } from "./AttachmentNode"

export const AttachmentExtension = defineExtension({
  name: "@projectproject/attachment",
  nodes: [AttachmentNode]
})
