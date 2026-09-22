import { defineExtension } from "lexical"

import { PaperNode } from "./PaperNode"

export const PaperExtension = defineExtension({
  name: "@pp/paper",
  nodes: [PaperNode]
})
