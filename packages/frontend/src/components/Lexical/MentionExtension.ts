import { defineExtension } from "lexical"
import { MentionNode } from "./MentionNode"

export const MentionExtension = defineExtension({
  name: "@projectproject/mention",
  nodes: [MentionNode]
})
