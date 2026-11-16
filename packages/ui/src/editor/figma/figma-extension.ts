import { defineExtension } from "lexical"

import { FigmaNode } from "./figma-node"

export const FigmaExtension = defineExtension({
  name: "@pp/figma",
  nodes: [FigmaNode]
})
