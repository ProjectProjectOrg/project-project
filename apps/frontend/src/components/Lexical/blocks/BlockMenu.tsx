import {
  ArrowDown,
  ArrowUp,
  Copy,
  RotateCcw,
  Trash2,
  Ungroup,
  Unlink,
  Upload
} from "lucide-react"

import { BlockIconGlyph } from "@/components/Library/BlockIconGlyph"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut
} from "@/components/ui/dropdown-menu"
import { m } from "@/paraglide/messages"

import { MOVE_DOWN_SHORTCUT, MOVE_UP_SHORTCUT } from "./blockKeyboard"
import type { BlockMenuAction, BlockMenuModel } from "./blockMenuModel"
import { ConfirmMenuItem } from "./ConfirmMenuItem"

export type BlockMenuProps = Readonly<{
  model: BlockMenuModel | null
  anchor: Element | null
  finalFocus: HTMLElement | null
  onClose: () => void
  onAction: (model: BlockMenuModel, action: BlockMenuAction) => void
}>

const focusPopup = (popup: HTMLDivElement | null) =>
  popup?.focus({ preventScroll: true })

export function BlockMenu({
  model,
  anchor,
  finalFocus,
  onClose,
  onAction
}: BlockMenuProps) {
  return (
    <DropdownMenu
      open={model !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {model !== null && (
        <DropdownMenuContent
          anchor={anchor}
          side="bottom"
          align="start"
          aria-label={m.editor_block_menu_label({ name: model.name })}
          data-block-menu
          finalFocus={() =>
            finalFocus?.isConnected === true ? finalFocus : false
          }
          className="w-60"
          ref={focusPopup}
        >
          <BlockMenuItems
            key={model.key}
            model={model}
            onAction={(action) => onAction(model, action)}
          />
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  )
}

function BlockMenuItems({
  model,
  onAction
}: Readonly<{
  model: BlockMenuModel
  onAction: (action: BlockMenuAction) => void
}>) {
  const hasDefinition = model.kind === "copy" && model.definition !== "none"
  const editable = model.definitionTarget !== null
  const matches = model.definition === "matches"

  return (
    <>
      <div className="flex items-center gap-2 px-2 pt-1.5 pb-1">
        <BlockIconGlyph icon={model.icon} color={model.color} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-foreground">
            {model.name}
          </p>
          {model.subtitle !== null && (
            <p className="truncate text-xs text-muted-foreground">
              {model.subtitle}
            </p>
          )}
        </div>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={!model.canMoveUp}
        onClick={() => onAction("move-up")}
      >
        <ArrowUp strokeWidth={1.75} />
        {m.editor_block_menu_move_up()}
        <DropdownMenuShortcut className="tracking-normal">
          {MOVE_UP_SHORTCUT}
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!model.canMoveDown}
        onClick={() => onAction("move-down")}
      >
        <ArrowDown strokeWidth={1.75} />
        {m.editor_block_menu_move_down()}
        <DropdownMenuShortcut className="tracking-normal">
          {MOVE_DOWN_SHORTCUT}
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAction("duplicate")}>
        <Copy strokeWidth={1.75} />
        {m.editor_block_menu_duplicate()}
      </DropdownMenuItem>
      {(hasDefinition || model.kind !== "copy") && <DropdownMenuSeparator />}
      {model.resetsTo === "definition" && (
        <ConfirmMenuItem
          icon={RotateCcw}
          label={m.editor_block_menu_reset()}
          confirmName={m.editor_block_menu_reset_confirm()}
          message={m.editor_block_menu_confirm_reset_message()}
          action={m.editor_block_menu_confirm_reset_action()}
          disabled={matches}
          onConfirm={() => onAction("reset")}
        />
      )}
      {model.resetsTo === "reference" && (
        <ConfirmMenuItem
          icon={RotateCcw}
          label={m.editor_template_revert()}
          confirmName={m.editor_block_menu_revert_confirm()}
          message={m.editor_block_menu_confirm_revert_message()}
          action={m.editor_block_menu_confirm_revert_action()}
          onConfirm={() => onAction("reset")}
        />
      )}
      {hasDefinition && editable && (
        <ConfirmMenuItem
          icon={Upload}
          label={m.editor_block_menu_make_definition()}
          confirmName={m.editor_block_menu_make_definition_confirm()}
          message={m.editor_block_menu_confirm_make_definition_message()}
          action={m.editor_block_menu_confirm_make_definition_action()}
          disabled={matches}
          onConfirm={() => onAction("make-definition")}
        />
      )}
      {model.kind !== "copy" && (
        <DropdownMenuItem onClick={() => onAction("detach")}>
          <Unlink strokeWidth={1.75} />
          {model.kind === "reference"
            ? m.editor_synced_customize()
            : m.editor_block_menu_detach()}
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onAction("unwrap")}>
        <Ungroup strokeWidth={1.75} />
        {m.editor_block_menu_remove_wrapper()}
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        onClick={() => onAction("remove")}
      >
        <Trash2 strokeWidth={1.75} />
        {m.editor_block_menu_remove()}
      </DropdownMenuItem>
    </>
  )
}
