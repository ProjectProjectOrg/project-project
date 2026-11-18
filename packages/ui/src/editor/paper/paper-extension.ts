import { defineExtension } from "lexical"

import { PaperNode } from "./paper-node"

export const PaperExtension = defineExtension({
  name: "@pp/paper",
  nodes: [PaperNode]
})
