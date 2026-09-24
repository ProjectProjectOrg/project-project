import type { Transformer } from "@lexical/markdown"
import {
  blockMatchesDefinition,
  type BlockDefinition,
  type BlockIconName,
  type BlockLookup
} from "@pp/shared"
import type { NodeKey } from "lexical"

import { blockChrome } from "@/components/blocks/blockChrome"
import {
  canEditDefinition,
  syncedChipLabel
} from "@/components/blocks/SyncedBlock"
import { syncedView } from "@/components/blocks/syncedContent"
import { m } from "@/paraglide/messages"

import { $isTicketBlockNode } from "../TicketBlockNode"
import {
  $blockMarkdown,
  $blockNeighbour,
  type TopLevelBlockNode
} from "./blockCommands"
import type { EditorBlocks } from "./editorBlocks"
import type { SyncedBlockNode } from "./SyncedBlockNode"

export type BlockMenuKind = "copy" | "synced" | "reference"

export type BlockDefinitionState = "none" | "matches" | "edited"

export type BlockResetTarget = "definition" | "reference"

export type BlockMenuModel = Readonly<{
  key: NodeKey
  blockType: string
  name: string
  icon: BlockIconName
  color: string | null
  kind: BlockMenuKind
  subtitle: string | null
  content: string
  canMoveUp: boolean
  canMoveDown: boolean
  definition: BlockDefinitionState
  definitionTarget: BlockDefinition | null
  resetsTo: BlockResetTarget | null
}>

export type BlockMenuAction =
  | "move-up"
  | "move-down"
  | "duplicate"
  | "reset"
  | "make-definition"
  | "detach"
  | "unwrap"
  | "remove"

const DEFINITION_SUBTITLES: Record<BlockDefinitionState, () => string | null> =
  {
    none: () => null,
    matches: m.editor_block_status_matches,
    edited: m.editor_block_status_edited
  }

type MenuContext = Readonly<{
  lookup: BlockLookup
  transformers: ReadonlyArray<Transformer>
  blocks: Pick<EditorBlocks, "canEdit" | "onMakeDefinition"> &
    Partial<Pick<EditorBlocks, "mode">>
}>

function $syncedModel(
  node: SyncedBlockNode,
  lookup: BlockLookup
): Pick<BlockMenuModel, "kind" | "subtitle" | "content"> {
  const mode = node.getMode()
  const view = syncedView(lookup, node.getBlockType(), node.getSnapshot(), mode)
  return {
    kind: mode,
    subtitle:
      view.kind === "live"
        ? syncedChipLabel(mode, view.definition.origin)
        : null,
    content: view.content
  }
}

export function $blockMenuModel(
  node: TopLevelBlockNode,
  context: MenuContext
): BlockMenuModel {
  const blockType = node.getBlockType()
  const chrome = blockChrome(blockType, context.lookup)
  const base = {
    key: node.getKey(),
    blockType,
    name: chrome.name,
    icon: chrome.icon,
    color: chrome.color,
    canMoveUp: $blockNeighbour(node, "up") !== null,
    canMoveDown: $blockNeighbour(node, "down") !== null
  }
  if (!$isTicketBlockNode(node))
    return {
      ...base,
      ...$syncedModel(node, context.lookup),
      definition: "none",
      definitionTarget: null,
      resetsTo: null
    }
  const content = $blockMarkdown(node, context.transformers)
  const definition = context.lookup(blockType)
  const state: BlockDefinitionState =
    definition === undefined || definition.hidden
      ? "none"
      : blockMatchesDefinition(content, definition)
        ? "matches"
        : "edited"
  const editable =
    definition !== undefined &&
    state !== "none" &&
    context.blocks.onMakeDefinition !== undefined &&
    canEditDefinition(definition.origin, context.blocks.canEdit)
  return {
    ...base,
    kind: "copy",
    subtitle: DEFINITION_SUBTITLES[state](),
    content,
    definition: state,
    definitionTarget: editable ? definition : null,
    resetsTo:
      state === "none"
        ? null
        : context.blocks.mode === "template"
          ? "reference"
          : "definition"
  }
}
