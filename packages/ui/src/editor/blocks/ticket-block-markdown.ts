import { $getExtensionOutput } from "@lexical/extension"
import {
  $convertToMarkdownString,
  MdastExtension,
  type MdastConfig,
  type MdastImportHandler
} from "@lexical/mdast"
import {
  TICKET_BLOCK_CLOSE,
  TICKET_BLOCK_OPEN,
  formatTicketBlock
} from "@pp/shared"
import {
  $createParagraphNode,
  $createTextNode,
  configExtension,
  defineExtension,
  safeCast
} from "lexical"
import type { Parent, Root, RootContent } from "mdast"
import type { Construct, State } from "micromark-util-types"

import {
  $createSyncedBlockNode,
  $isSyncedBlockNode,
  SyncedBlockNode
} from "./synced-block-node"
import {
  $createTicketBlockNode,
  $isTicketBlockNode,
  TicketBlockNode
} from "./ticket-block-node"

type TicketBlockLine = Readonly<{
  type: "ticketBlockLine"
  value: string
  position?: Parent["position"]
}>

type TicketBlock = Readonly<{
  type: "ticketBlock"
  blockType: string
  sync: boolean
  children: Array<RootContent>
  position?: Parent["position"]
}>

declare module "mdast" {
  interface RootContentMap {
    ticketBlock: TicketBlock
    ticketBlockLine: TicketBlockLine
  }
}

declare module "micromark-util-types" {
  interface TokenTypeMap {
    ticketBlockLine: "ticketBlockLine"
  }
}

const isBlockLine = (line: string) =>
  TICKET_BLOCK_OPEN.test(line) || TICKET_BLOCK_CLOSE.test(line)

const ticketBlockLine: Construct = {
  name: "ticketBlockLine",
  add: "before",
  tokenize(effects, ok, nok) {
    let line = ""
    const inside: State = (code) => {
      if (code === null || code < -2) {
        if (!isBlockLine(line)) return nok(code)
        effects.exit("ticketBlockLine")
        return ok(code)
      }
      line += code < 0 ? " " : String.fromCodePoint(code)
      effects.consume(code)
      return inside
    }
    return (code) => {
      effects.enter("ticketBlockLine")
      return inside(code)
    }
  }
}

const groupTicketBlocks = (tree: Root) => {
  const nodes = tree.children
  const children: Array<RootContent> = []
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]
    const open =
      node.type === "ticketBlockLine"
        ? TICKET_BLOCK_OPEN.exec(node.value)
        : null
    const end = nodes.findIndex(
      (candidate, at) => at > index && candidate.type === "ticketBlockLine"
    )
    const close = nodes[end]
    if (
      open === null ||
      close?.type !== "ticketBlockLine" ||
      !TICKET_BLOCK_CLOSE.test(close.value)
    ) {
      children.push(node)
      continue
    }
    children.push({
      type: "ticketBlock",
      blockType: open[1],
      sync: open[2] !== undefined,
      children: nodes.slice(index + 1, end),
      position:
        node.position && close.position
          ? { start: node.position.end, end: close.position.start }
          : undefined
    })
    index = end
  }
  tree.children = children
}

const ticketBlockSyntax = {
  micromark: {
    flow: { 60: ticketBlockLine }
  } satisfies MdastConfig["micromarkExtensions"][number],
  mdast: {
    enter: {
      ticketBlockLine(token) {
        this.enter(
          { type: "ticketBlockLine", value: this.sliceSerialize(token) },
          token
        )
      }
    },
    exit: {
      ticketBlockLine(token) {
        this.exit(token)
      }
    },
    transforms: [groupTicketBlocks]
  } satisfies MdastConfig["mdastExtensions"][number]
}

const trimBlankLines = (content: string) =>
  content.replace(/^(?:[ \t]*\n)+/, "").replace(/(?:\n[ \t]*)+$/, "")

const $importTicketBlock: MdastImportHandler<TicketBlock> = (node, context) => {
  const { emptyAsReference } = $getExtensionOutput(TicketBlockMarkdownExtension)
  if (node.sync) {
    const range = node.position
    const content =
      range?.start.offset === undefined || range.end.offset === undefined
        ? ""
        : context.source.slice(range.start.offset, range.end.offset)
    return $createSyncedBlockNode(node.blockType, trimBlankLines(content))
  }
  if (emptyAsReference && node.children.length === 0)
    return $createSyncedBlockNode(node.blockType, "", "reference")
  const blocks = context.importChildren(node)
  return $createTicketBlockNode(node.blockType).append(
    ...(blocks.length === 0 ? [$createParagraphNode()] : blocks)
  )
}

const $importBlockLine: MdastImportHandler<TicketBlockLine> = (node) =>
  $createParagraphNode().append($createTextNode(node.value))

type TicketBlockMarkdownConfig = Readonly<{ emptyAsReference: boolean }>

export const TicketBlockMarkdownExtension = defineExtension({
  name: "@pp/ticket-block-markdown",
  config: safeCast<TicketBlockMarkdownConfig>({ emptyAsReference: false }),
  build: (_editor, config) => config,
  nodes: [TicketBlockNode, SyncedBlockNode],
  dependencies: [
    configExtension(MdastExtension, {
      micromarkExtensions: [ticketBlockSyntax.micromark],
      mdastExtensions: [ticketBlockSyntax.mdast],
      importRules: [
        { type: "ticketBlock", $import: $importTicketBlock },
        { type: "ticketBlockLine", $import: $importBlockLine }
      ],
      exportRules: [
        {
          type: TicketBlockNode,
          $export: (node) =>
            $isTicketBlockNode(node)
              ? {
                  type: "html",
                  value: formatTicketBlock(
                    node.getBlockType(),
                    $convertToMarkdownString(node)
                  )
                }
              : null
        },
        {
          type: SyncedBlockNode,
          $export: (node) =>
            $isSyncedBlockNode(node)
              ? {
                  type: "html",
                  value:
                    node.getMode() === "reference"
                      ? formatTicketBlock(node.getBlockType(), "")
                      : formatTicketBlock(
                          node.getBlockType(),
                          node.getSnapshot(),
                          { sync: true }
                        )
                }
              : null
        }
      ]
    })
  ]
})
