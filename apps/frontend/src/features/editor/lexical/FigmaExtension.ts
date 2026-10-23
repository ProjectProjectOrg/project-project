import { defineExtension } from "lexical"

import { FigmaNode } from "./FigmaNode"

export const FigmaExtension = defineExtension({
  name: "@pp/figma",
  nodes: [FigmaNode]
})
