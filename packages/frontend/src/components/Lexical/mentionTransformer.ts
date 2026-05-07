import type { TextMatchTransformer } from "@lexical/markdown"
import { $createTextNode } from "lexical"
import {
  formatMentionHref,
  parseMentionHref
} from "@projectproject/shared"
import {
  $createMentionNode,
  $isMentionNode,
  MentionNode
} from "./MentionNode"

export const MENTION_TRANSFORMER: TextMatchTransformer = {
  dependencies: [MentionNode],
  export: (node) => {
    if (!$isMentionNode(node)) return null
    const href = formatMentionHref(node.__mentionType, node.__mentionId)
    return `[${node.__mentionLabel}](${href})`
  },
  importRegExp: /\[([^\]]+)\]\((mention:[^)]+)\)/,
  regExp: /\[([^\]]+)\]\((mention:[^)]+)\)$/,
  replace: (textNode, match) => {
    const [, label, href] = match
    const parsed = parseMentionHref(href)
    if (!parsed) {
      textNode.replace($createTextNode(match[0]))
      return
    }
    textNode.replace($createMentionNode(parsed.type, parsed.id, label))
  },
  trigger: ")",
  type: "text-match"
}
