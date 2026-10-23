import { defineExtension } from "lexical"

import { MentionNode } from "./MentionNode"

export const MentionExtension = defineExtension({
  name: "@pp/mention",
  nodes: [MentionNode]
})
