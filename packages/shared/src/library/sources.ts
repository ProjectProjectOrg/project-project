import * as Schema from "effect/Schema"

import { formatTicketBlock } from "../tickets/blocks"
import { BlockDraft, type BlockIcon } from "./Library"

export type BlockSource = Readonly<{
  key: string
  name: string
  icon: BlockIcon
  description: string
  sync: boolean
  content: string
}>

export const lines = (...parts: ReadonlyArray<string>): string =>
  parts.join("\n")

export const references = (...keys: ReadonlyArray<string>): string =>
  keys.map((key) => formatTicketBlock(key, "")).join("\n\n")

const decodeBlockDrafts = Schema.decodeUnknownSync(Schema.Array(BlockDraft))

export const blockDraftsFrom = (
  sources: ReadonlyArray<BlockSource>
): ReadonlyArray<BlockDraft> =>
  decodeBlockDrafts(sources.map((source) => ({ ...source, color: null })))
