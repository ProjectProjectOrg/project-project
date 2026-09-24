import type { Transformer } from "@lexical/markdown"

import { BlockGutterPlugin } from "./BlockGutterPlugin"
import { BlockHintsPlugin } from "./BlockHintsPlugin"
import { hasBlockGutter, type EditorBlocks } from "./editorBlocks"
import { DefinitionModePlugin } from "./EditorModePlugins"
import { SlashMenuPlugin } from "./SlashMenuPlugin"
import { SyncedBlocksPlugin } from "./SyncedBlocksPlugin"

export function TicketBlocksPlugins({
  blocks,
  transformers
}: Readonly<{
  blocks: EditorBlocks
  transformers: ReadonlyArray<Transformer>
}>) {
  return (
    <>
      {hasBlockGutter(blocks) ? (
        <BlockGutterPlugin blocks={blocks} transformers={transformers} />
      ) : null}
      <SyncedBlocksPlugin library={blocks.library} />
      {blocks.mode !== "definition" ? (
        <BlockHintsPlugin library={blocks.library} />
      ) : null}
      <SlashMenuPlugin
        library={blocks.library}
        transformers={transformers}
        mode={blocks.mode}
      />
      {blocks.mode === "definition" ? (
        <DefinitionModePlugin transformers={transformers} />
      ) : null}
    </>
  )
}
