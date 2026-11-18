import type { Transformer } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useLexicalEditable } from "@lexical/react/useLexicalEditable"
import { mergeRegister } from "@lexical/utils"
import {
  $getNodeByKey,
  COMMAND_PRIORITY_LOW,
  HISTORY_PUSH_TAG,
  type NodeKey
} from "lexical"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState
} from "react"
import { createPortal } from "react-dom"

import { TooltipGroup } from "../../components/tooltip"
import { m } from "../messages"
import { blockChrome, lookupFor } from "./block-chrome"
import {
  $duplicateBlock,
  $findBlockAtSelection,
  $isTopLevelBlockNode,
  $moveBlock,
  $moveBlockTo,
  $removeBlock,
  $resetBlock,
  $unwrapBlock,
  OPEN_BLOCK_MENU_COMMAND
} from "./block-commands"
import { BlockDragPreview } from "./block-drag-preview"
import { registerBlockKeyboard } from "./block-keyboard"
import { BlockMenu } from "./block-menu"
import {
  $blockMenuModel,
  type BlockMenuAction,
  type BlockMenuModel
} from "./block-menu-model"
import { railHost } from "./block-rail"
import type { DropPlacement } from "./drag-layout"
import type { EditorBlocks } from "./editor-blocks"
import { GutterButton } from "./gutter-button"
import {
  blockAtY,
  flash,
  focusedWithin,
  inDocumentOrder,
  measureItems,
  measureRail,
  sameItems,
  type Created,
  type GutterItem
} from "./gutter-layout"
import {
  DETACH_SYNCED_BLOCK_COMMAND,
  SyncedBlockNode
} from "./synced-block-node"
import { $revertToReference } from "./template-blocks"
import { $isTicketBlockNode, TicketBlockNode } from "./ticket-block-node"
import { useBlockAnnouncer } from "./use-block-announcer"
import { useBlockDrag } from "./use-block-drag"

const LANDING_MS = 1500

const NO_LANDING: ReadonlyMap<NodeKey, number> = new Map()

export function BlockGutterPlugin({
  blocks,
  transformers
}: Readonly<{
  blocks: Pick<EditorBlocks, "library" | "canEdit" | "onMakeDefinition"> &
    Partial<Pick<EditorBlocks, "mode">>
  transformers: ReadonlyArray<Transformer>
}>) {
  const [editor] = useLexicalComposerContext()
  const editable = useLexicalEditable()
  const { library, canEdit, onMakeDefinition, mode } = blocks
  const lookup = useMemo(() => lookupFor(library), [library])
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [items, setItems] = useState<ReadonlyArray<GutterItem>>([])
  const [landing, setLanding] =
    useState<ReadonlyMap<NodeKey, number>>(NO_LANDING)
  const [rail, setRail] = useState<number | null>(null)
  const [hovered, setHovered] = useState<NodeKey | null>(null)
  const [active, setActive] = useState<NodeKey | null>(null)
  const [focused, setFocused] = useState(false)
  const [editorFocused, setEditorFocused] = useState(false)
  const [menu, setMenu] = useState<BlockMenuModel | null>(null)
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null)
  const { announcement, announce, announceMoved } = useBlockAnnouncer(lookup)

  const onDrop = useCallback(
    (key: NodeKey, target: DropPlacement) =>
      editor.update(
        () => {
          const node = $getNodeByKey(key)
          const reference = $getNodeByKey(target.key)
          if (!$isTopLevelBlockNode(node) || reference === null) return
          if (!$moveBlockTo(node, reference, target.placement)) return
          announceMoved(
            node,
            reference,
            target.placement === "before" ? "up" : "down"
          )
        },
        { tag: HISTORY_PUSH_TAG, discrete: true }
      ),
    [announceMoved, editor]
  )

  const { drag, previewY, gripHandlers, consumeClick, isDragging } =
    useBlockDrag({ editor, anchor, onDrop })

  const $openMenu = useCallback(
    (key: NodeKey) => {
      const node = $getNodeByKey(key)
      if (!$isTopLevelBlockNode(node)) return
      setReturnFocus(focusedWithin(editor))
      setMenu(
        $blockMenuModel(node, {
          lookup,
          transformers,
          blocks: { canEdit, onMakeDefinition, mode }
        })
      )
    },
    [canEdit, editor, lookup, mode, onMakeDefinition, transformers]
  )

  useEffect(
    () =>
      editor.registerRootListener((root) => {
        setAnchor(root?.parentElement ?? null)
      }),
    [editor]
  )

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          OPEN_BLOCK_MENU_COMMAND,
          (key) => {
            $openMenu(key)
            return true
          },
          COMMAND_PRIORITY_LOW
        ),
        registerBlockKeyboard(editor, {
          transformers,
          onMoved: announceMoved,
          onRemoved: (blockType) =>
            announce(
              m.editor_block_announce_removed({
                name: blockChrome(blockType, lookup).name
              })
            ),
          onOpenMenu: $openMenu
        })
      ),
    [$openMenu, announce, announceMoved, editor, lookup, transformers]
  )

  useEffect(() => {
    if (anchor === null) return
    let frame = 0
    const measure = () => {
      const next = measureItems(editor, anchor)
      setItems((current) => (sameItems(current, next) ? current : next))
      setRail(measureRail(anchor))
    }
    const schedule = () => {
      if (frame !== 0) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    }
    let pending: Array<Created> = []
    let landed = 0
    const flashPending = () => {
      const ordered = inDocumentOrder(pending)
      pending = []
      ordered.forEach(({ element }, order) => flash(element, order))
      setLanding(new Map(ordered.map(({ key }, order) => [key, order])))
      window.clearTimeout(landed)
      landed = window.setTimeout(() => setLanding(NO_LANDING), LANDING_MS)
    }
    const flashCreated = (mutations: Map<NodeKey, string>) => {
      const queued = pending.length > 0
      for (const [key, mutation] of mutations) {
        const element = editor.getElementByKey(key)
        if (mutation === "created" && element !== null)
          pending.push({ key, element })
      }
      if (!queued && pending.length > 0) queueMicrotask(flashPending)
    }
    measure()
    const resize = new ResizeObserver(schedule)
    resize.observe(anchor)
    resize.observe(railHost(anchor))
    window.addEventListener("resize", schedule)
    const unregister = mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        measure()
        setActive(
          editorState.read(() => $findBlockAtSelection()?.getKey() ?? null)
        )
      }),
      editor.registerMutationListener(TicketBlockNode, flashCreated, {
        skipInitialization: true
      }),
      editor.registerMutationListener(SyncedBlockNode, flashCreated, {
        skipInitialization: true
      })
    )
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      window.clearTimeout(landed)
      resize.disconnect()
      window.removeEventListener("resize", schedule)
      unregister()
    }
  }, [anchor, editor])

  useEffect(() => {
    if (anchor === null) return
    const area = anchor.closest<HTMLElement>(".block-gutter") ?? anchor
    const move = (event: PointerEvent) => {
      if (isDragging()) return
      setHovered(blockAtY(editor, items, event.clientY))
    }
    const leave = () => setHovered(null)
    const focusIn = (event: FocusEvent) => {
      setFocused(true)
      setEditorFocused(event.target === editor.getRootElement())
    }
    const focusOut = (event: FocusEvent) => {
      setEditorFocused(false)
      if (
        !(
          event.relatedTarget instanceof Node &&
          area.contains(event.relatedTarget)
        )
      )
        setFocused(false)
    }
    area.addEventListener("pointermove", move)
    area.addEventListener("pointerleave", leave)
    area.addEventListener("focusin", focusIn)
    area.addEventListener("focusout", focusOut)
    return () => {
      area.removeEventListener("pointermove", move)
      area.removeEventListener("pointerleave", leave)
      area.removeEventListener("focusin", focusIn)
      area.removeEventListener("focusout", focusOut)
    }
  }, [anchor, editor, isDragging, items])

  const dragKey = drag?.key ?? null
  const highlighted = dragKey === null ? (menu?.key ?? hovered) : null

  const editing =
    editorFocused && dragKey === null && menu === null ? active : null

  useLayoutEffect(() => {
    if (editing === null) return
    const element = editor.getElementByKey(editing)
    if (element === null) return
    element.dataset.active = ""
    return () => {
      delete element.dataset.active
    }
  }, [editor, editing])

  useLayoutEffect(() => {
    if (highlighted === null) return
    const element = editor.getElementByKey(highlighted)
    if (element === null) return
    element.dataset.hovered = ""
    return () => {
      delete element.dataset.hovered
    }
  }, [editor, highlighted])

  const onClick = (key: NodeKey) => {
    if (consumeClick()) return
    editor.dispatchCommand(OPEN_BLOCK_MENU_COMMAND, key)
  }

  const runAction = (model: BlockMenuModel, action: BlockMenuAction) => {
    setMenu(null)
    const name = model.name
    if (action === "detach") {
      editor.dispatchCommand(DETACH_SYNCED_BLOCK_COMMAND, {
        key: model.key,
        content: model.content
      })
      announce(m.editor_block_announce_detached({ name }))
      return
    }
    if (action === "make-definition") {
      if (model.definitionTarget === null) return
      onMakeDefinition?.(model.definitionTarget, model.content)
      announce(m.editor_block_announce_made_definition({ name }))
      return
    }
    editor.update(
      () => {
        const node = $getNodeByKey(model.key)
        if (!$isTopLevelBlockNode(node)) return
        switch (action) {
          case "move-up":
          case "move-down": {
            const direction = action === "move-up" ? "up" : "down"
            announceMoved(node, $moveBlock(node, direction), direction)
            return
          }
          case "duplicate":
            $duplicateBlock(node)
            announce(m.editor_block_announce_duplicated({ name }))
            return
          case "reset": {
            const definition = lookup(model.blockType)
            if (!$isTicketBlockNode(node) || definition === undefined) return
            if (model.resetsTo === "reference") {
              $revertToReference(node)
              announce(m.editor_block_announce_reverted({ name }))
              return
            }
            $resetBlock(node, definition, transformers)
            announce(m.editor_block_announce_reset({ name }))
            return
          }
          case "unwrap":
            $unwrapBlock(node, model.content, transformers)
            announce(m.editor_block_announce_unwrapped({ name }))
            return
          case "remove":
            $removeBlock(node)
            announce(m.editor_block_announce_removed({ name }))
        }
      },
      { tag: HISTORY_PUSH_TAG }
    )
  }

  if (anchor === null) return null

  const menuAnchor =
    menu === null
      ? null
      : anchor.querySelector(`[data-block-key="${menu.key}"]`)

  return createPortal(
    <TooltipGroup side="left">
      <div className="pointer-events-none absolute inset-0" data-block-gutter>
        {rail !== null && (
          <div
            aria-hidden
            data-block-rail
            className="pointer-events-auto absolute inset-y-0"
            style={{ left: rail, width: -rail }}
          />
        )}
        {rail !== null &&
          items.map((item) => (
            <GutterButton
              key={item.key}
              nodeKey={item.key}
              blockType={item.blockType}
              lookup={lookup}
              top={item.top + (drag?.shifts.get(item.key) ?? 0)}
              left={rail}
              landOrder={landing.get(item.key)}
              state={{
                grip:
                  editable &&
                  (item.key === hovered ||
                    item.key === menu?.key ||
                    (focused && item.key === active)),
                expanded: item.key === menu?.key,
                dragging: dragKey !== null,
                source: item.key === dragKey,
                readOnly: !editable
              }}
              onClick={() => onClick(item.key)}
              {...gripHandlers(item.key)}
            />
          ))}
        {drag !== null && <BlockDragPreview drag={drag} y={previewY} />}
      </div>
      <output aria-live="polite" className="sr-only">
        <span key={announcement.id}>{announcement.text}</span>
      </output>
      <BlockMenu
        model={menu}
        anchor={menuAnchor}
        finalFocus={returnFocus}
        onClose={() => setMenu(null)}
        onAction={runAction}
      />
    </TooltipGroup>,
    anchor
  )
}
