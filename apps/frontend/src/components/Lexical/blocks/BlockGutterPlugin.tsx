import type { Transformer } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { mergeRegister } from "@lexical/utils"
import {
  $getNodeByKey,
  COMMAND_PRIORITY_LOW,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  type LexicalNode,
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

import { blockChrome, lookupFor } from "@/components/blocks/blockChrome"
import { Kbd } from "@/components/ui/kbd"
import { TooltipProvider } from "@/components/ui/tooltip"
import { m } from "@/paraglide/messages"

import { $isTicketBlockNode, TicketBlockNode } from "../TicketBlockNode"
import {
  $duplicateBlock,
  $findBlockAtSelection,
  $isTopLevelBlockNode,
  $moveBlock,
  $moveBlockTo,
  $removeBlock,
  $resetBlock,
  $topLevelBlocks,
  $unwrapBlock,
  OPEN_BLOCK_MENU_COMMAND,
  type BlockDirection,
  type TopLevelBlockNode
} from "./blockCommands"
import { BlockDragPreview } from "./BlockDragPreview"
import { OPEN_MENU_SHORTCUT, registerBlockKeyboard } from "./blockKeyboard"
import { BlockMenu } from "./BlockMenu"
import {
  $blockMenuModel,
  type BlockMenuAction,
  type BlockMenuModel
} from "./blockMenuModel"
import {
  layoutTop,
  measureRailBounds,
  RAIL_SIZE,
  railHost,
  railLeft
} from "./blockRail"
import type { DropPlacement } from "./dragLayout"
import type { EditorBlocks } from "./editorBlocks"
import { GutterButton } from "./GutterButton"
import { DETACH_SYNCED_BLOCK_COMMAND, SyncedBlockNode } from "./SyncedBlockNode"
import { useBlockDrag } from "./useBlockDrag"

type GutterItem = Readonly<{
  key: NodeKey
  blockType: string
  synced: boolean
  top: number
  blockTop: number
  right: number
}>

type Announcement = Readonly<{ id: number; text: string }>

const HINT_LIFT = 12

const firstLineOffset = (block: HTMLElement): number => {
  const line =
    block.firstElementChild instanceof HTMLElement
      ? block.firstElementChild
      : block
  const top =
    line === block
      ? 0
      : line.offsetParent === block
        ? line.offsetTop
        : line.getBoundingClientRect().top - block.getBoundingClientRect().top
  const lineHeight = Number.parseFloat(getComputedStyle(line).lineHeight)
  const box = Number.isFinite(lineHeight)
    ? lineHeight
    : line.getBoundingClientRect().height
  return top + (box - RAIL_SIZE) / 2
}

const measureItems = (
  editor: LexicalEditor,
  anchor: HTMLElement
): ReadonlyArray<GutterItem> => {
  const anchorRight = anchor.getBoundingClientRect().right
  return editor.getEditorState().read(() =>
    $topLevelBlocks().flatMap((node) => {
      const element = editor.getElementByKey(node.getKey())
      if (element === null) return []
      const blockTop = layoutTop(element, anchor)
      return [
        {
          key: node.getKey(),
          blockType: node.getBlockType(),
          synced: !$isTicketBlockNode(node),
          top: blockTop + firstLineOffset(element),
          blockTop,
          right: anchorRight - element.getBoundingClientRect().right
        }
      ]
    })
  )
}

const sameItems = (
  a: ReadonlyArray<GutterItem>,
  b: ReadonlyArray<GutterItem>
): boolean =>
  a.length === b.length &&
  a.every(
    (item, index) =>
      item.key === b[index].key &&
      item.blockType === b[index].blockType &&
      Math.abs(item.top - b[index].top) < 0.5 &&
      Math.abs(item.right - b[index].right) < 0.5
  )

const blockAtY = (
  editor: LexicalEditor,
  items: ReadonlyArray<GutterItem>,
  y: number
): NodeKey | null =>
  items.find((item) => {
    const rect = editor.getElementByKey(item.key)?.getBoundingClientRect()
    return rect !== undefined && y >= rect.top && y <= rect.bottom
  })?.key ?? null

const focusedWithin = (editor: LexicalEditor): HTMLElement | null => {
  const active = document.activeElement
  const area = editor.getRootElement()?.parentElement
  return active instanceof HTMLElement && area?.contains(active) === true
    ? active
    : null
}

const measureRail = (anchor: HTMLElement): number | null =>
  railLeft(measureRailBounds(anchor, railHost(anchor)))

const flash = (element: HTMLElement, order: number) => {
  element.style.setProperty("--flash-order", String(order))
  element.dataset.flash = ""
  const settle = (event: AnimationEvent) => {
    if (event.animationName !== "ticket-block-flash") return
    element.removeEventListener("animationend", settle)
    delete element.dataset.flash
    element.style.removeProperty("--flash-order")
  }
  element.addEventListener("animationend", settle)
}

type Created = Readonly<{ key: NodeKey; element: HTMLElement }>

const LANDING_MS = 1500
const NO_LANDING: ReadonlyMap<NodeKey, number> = new Map()

const inDocumentOrder = (
  created: ReadonlyArray<Created>
): ReadonlyArray<Created> =>
  created.toSorted((a, b) =>
    a.element.compareDocumentPosition(b.element) &
    Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1
  )

function useAnnouncer() {
  const [announcement, setAnnouncement] = useState<Announcement>({
    id: 0,
    text: ""
  })
  const announce = useCallback(
    (text: string) =>
      setAnnouncement((current) => ({ id: current.id + 1, text })),
    []
  )
  return { announcement, announce }
}

export function BlockGutterPlugin({
  blocks,
  transformers
}: Readonly<{
  blocks: Pick<EditorBlocks, "library" | "canEdit" | "onMakeDefinition">
  transformers: ReadonlyArray<Transformer>
}>) {
  const [editor] = useLexicalComposerContext()
  const { library, canEdit, onMakeDefinition } = blocks
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
  const { announcement, announce } = useAnnouncer()

  const nameOf = useCallback(
    (node: LexicalNode | null): string | null =>
      $isTopLevelBlockNode(node)
        ? blockChrome(node.getBlockType(), lookup).name
        : null,
    [lookup]
  )

  const announceMoved = useCallback(
    (
      node: TopLevelBlockNode,
      neighbour: LexicalNode | null,
      direction: BlockDirection
    ) => {
      const name = nameOf(node) ?? ""
      if (neighbour === null) {
        announce(
          direction === "up"
            ? m.editor_block_announce_edge_top({ name })
            : m.editor_block_announce_edge_bottom({ name })
        )
        return
      }
      const target = nameOf(neighbour)
      if (target === null)
        announce(
          direction === "up"
            ? m.editor_block_announce_moved_up({ name })
            : m.editor_block_announce_moved_down({ name })
        )
      else
        announce(
          direction === "up"
            ? m.editor_block_announce_moved_above({ name, target })
            : m.editor_block_announce_moved_below({ name, target })
        )
    },
    [announce, nameOf]
  )

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
          blocks: { canEdit, onMakeDefinition }
        })
      )
    },
    [canEdit, editor, lookup, onMakeDefinition, transformers]
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
  const hintItem =
    focused && dragKey === null && menu === null
      ? items.find((item) => item.key === active && !item.synced)
      : undefined

  return createPortal(
    <TooltipProvider>
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
                  item.key === hovered ||
                  item.key === menu?.key ||
                  (focused && item.key === active),
                expanded: item.key === menu?.key,
                dragging: dragKey !== null,
                source: item.key === dragKey
              }}
              onClick={() => onClick(item.key)}
              {...gripHandlers(item.key)}
            />
          ))}
        {hintItem !== undefined && (
          <Kbd
            size="sm"
            data-block-shortcut-hint
            className="absolute animate-in opacity-70 duration-150 fade-in"
            style={{
              top: hintItem.blockTop - HINT_LIFT,
              right: hintItem.right + 8
            }}
          >
            {OPEN_MENU_SHORTCUT}
          </Kbd>
        )}
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
    </TooltipProvider>,
    anchor
  )
}
