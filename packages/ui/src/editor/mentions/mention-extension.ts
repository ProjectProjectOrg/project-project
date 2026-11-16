import { defineExtension } from "lexical"

import { MentionNode } from "./mention-node"

export const MentionExtension = defineExtension({
  name: "@pp/mention",
  nodes: [MentionNode]
})
