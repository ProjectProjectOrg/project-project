import { SlashMenuPlugin } from "../slash-menu/slash-menu-plugin"
import { BlockGutterPlugin } from "./block-gutter-plugin"
import { BlockHintsPlugin } from "./block-hints-plugin"
import { hasBlockGutter, type EditorBlocks } from "./editor-blocks"
import {
  DefinitionModePlugin,
  TemplateCustomizedPlugin
} from "./editor-mode-plugins"
import { SyncedBlocksPlugin } from "./synced-blocks-plugin"

export function TicketBlocksPlugins({
  blocks
}: Readonly<{ blocks: EditorBlocks }>) {
  return (
    <>
      {hasBlockGutter(blocks) ? <BlockGutterPlugin blocks={blocks} /> : null}
      <SyncedBlocksPlugin library={blocks.library} />
      {blocks.mode !== "definition" ? (
        <BlockHintsPlugin library={blocks.library} />
      ) : null}
      <SlashMenuPlugin
        library={blocks.library}
        ticketType={blocks.ticketType}
        mode={blocks.mode}
      />
      {blocks.mode === "template" ? (
        <TemplateCustomizedPlugin library={blocks.library} />
      ) : null}
      {blocks.mode === "definition" ? <DefinitionModePlugin /> : null}
    </>
  )
}
