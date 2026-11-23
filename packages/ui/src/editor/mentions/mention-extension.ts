import { MdastExtension, type MdastImportHandler } from "@lexical/mdast"
import { formatMentionHref, parseMentionHref } from "@pp/shared"
import { configExtension, defineExtension } from "lexical"
import type { Link } from "mdast"

import { plainText } from "../markdown-extension"
import { $createMentionNode, $isMentionNode, MentionNode } from "./mention-node"

const $importMention: MdastImportHandler<Link> = (node, context) => {
  const parsed = parseMentionHref(node.url)
  return parsed === null
    ? context.next()
    : $createMentionNode(parsed.type, parsed.id, plainText(node))
}

export const MentionExtension = defineExtension({
  name: "@pp/mention",
  nodes: [MentionNode],
  dependencies: [
    configExtension(MdastExtension, {
      importRules: [{ type: "link", $import: $importMention }],
      exportRules: [
        {
          type: MentionNode,
          $export: (node) =>
            $isMentionNode(node)
              ? {
                  type: "link",
                  url: formatMentionHref(node.__mentionType, node.__mentionId),
                  children: [{ type: "text", value: node.__mentionLabel }]
                }
              : null
        }
      ]
    })
  ]
})
