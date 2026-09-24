import { useAtomSet } from "@effect/atom-react"
import {
  blockLookupFor,
  expandTemplate,
  formatTicketBlock,
  galleryBlocksFor,
  galleryBlocksToAdopt,
  galleryTemplatesFor,
  stripHints,
  type BlockDefinition,
  type BlockDraft,
  type Library,
  type TemplateDraft
} from "@pp/shared"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import {
  animate,
  AnimatePresence,
  frame,
  motion,
  useMotionValue,
  useReducedMotion
} from "motion/react"
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react"

import { LibraryContext } from "@/components/blocks/blockChrome"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import {
  sketchLines,
  templateSketch,
  type SketchBlock
} from "./blockSketchModel"
import { DitheredBlocks } from "./DitheredBlocks"
import { GalleryTile, type GalleryItem } from "./GalleryTile"
import { blockDraftOf, templateDraftOf, type LibraryKind } from "./libraryModel"
import { failureText } from "./LibraryRow"
import {
  createBlockAtom,
  createTemplateAtom,
  type LibraryScope
} from "./libraryScope"
import { LIBRARY_GRID_CLASS, LibrarySectionHeader } from "./LibrarySection"
import { LibrarySyncedLabel } from "./LibrarySyncedLabel"

type GalleryError = Readonly<{ key: string; message: string | null }>

type GalleryProps = Readonly<{ scope: LibraryScope; library: Library }>

type Exited = Exit.Exit<unknown, Readonly<{ _tag: string }>>

const failureOf = (exit: Exited): string | null =>
  Exit.isFailure(exit) ? failureText(AsyncResult.fromExit(exit)) : null

const withGalleryBlocks = (library: Library, scope: LibraryScope): Library => ({
  ...library,
  blocks: [
    ...library.blocks,
    ...galleryBlocksFor(library).map(
      (draft): BlockDefinition => ({
        ...draft,
        origin: scope.layer,
        shadows: null,
        hidden: false
      })
    )
  ]
})

export function TemplateGalleryWell({ scope, library }: GalleryProps) {
  const preview = useMemo(
    () => withGalleryBlocks(library, scope),
    [library, scope]
  )
  const lookup = useMemo(() => blockLookupFor(preview), [preview])
  const createTemplate = useAtomSet(createTemplateAtom(scope), {
    mode: "promiseExit"
  })
  const createBlock = useAtomSet(createBlockAtom(scope), {
    mode: "promiseExit"
  })
  const drafts = galleryTemplatesFor(library)

  const adopt = async (draft: TemplateDraft): Promise<string | null> => {
    for (const block of galleryBlocksToAdopt(library, draft)) {
      const message = failureOf(await createBlock(blockDraftOf(block)))
      if (message !== null) return message
    }
    return failureOf(await createTemplate(templateDraftOf(draft)))
  }

  return (
    <LibraryContext value={preview}>
      <GalleryWell
        kind="template"
        canAdd={library.canEdit}
        description={m.templates_settings_gallery_description()}
        allAdded={m.templates_settings_gallery_all_added()}
        tiles={drafts.map((draft) => ({
          item: draft,
          badge: null,
          sketch: templateSketch(draft.body, lookup, TEMPLATE_SKETCH_LINES),
          sketchNames: true,
          preview: expandTemplate(draft, lookup),
          adopt: () => adopt(draft)
        }))}
      />
    </LibraryContext>
  )
}

export function BlockGalleryWell({ scope, library }: GalleryProps) {
  const create = useAtomSet(createBlockAtom(scope), { mode: "promiseExit" })
  const drafts: ReadonlyArray<BlockDraft> = galleryBlocksFor(library)

  return (
    <GalleryWell
      kind="block"
      canAdd={library.canEdit}
      description={m.templates_settings_gallery_blocks_description()}
      allAdded={m.templates_settings_gallery_all_added_blocks()}
      tiles={drafts.map((draft) => ({
        item: draft,
        badge: draft.sync ? <LibrarySyncedLabel /> : null,
        sketch: [
          {
            key: draft.key,
            name: draft.name,
            icon: draft.icon,
            color: draft.color,
            lines: sketchLines(draft.content, BLOCK_SKETCH_LINES)
          }
        ],
        sketchNames: false,
        preview: formatTicketBlock(draft.key, stripHints(draft.content)),
        adopt: async () => failureOf(await create(blockDraftOf(draft)))
      }))}
    />
  )
}

const TEMPLATE_SKETCH_LINES = 2
const BLOCK_SKETCH_LINES = 4

type Tile = Readonly<{
  item: GalleryItem
  badge: ReactNode
  sketch: ReadonlyArray<SketchBlock>
  sketchNames: boolean
  preview: string
  adopt: () => Promise<string | null>
}>

function GalleryWell({
  kind,
  canAdd,
  description,
  allAdded,
  tiles
}: Readonly<{
  kind: LibraryKind
  canAdd: boolean
  description: string
  allAdded: string
  tiles: ReadonlyArray<Tile>
}>) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<GalleryError | null>(null)
  const headingId = `library-gallery-heading-${kind}`

  if (tiles.length === 0)
    return (
      <p className="flex items-center gap-3 px-3 text-xs text-muted-foreground">
        <DitheredBlocks size={28} />
        {allAdded}
      </p>
    )

  const add = async (tile: Tile) => {
    setError(null)
    const message = await tile.adopt()
    if (message !== null) setError({ key: tile.item.key, message })
  }

  // Focus mode: while a tile is previewed, the others fade out and are
  // lifted out of the grid (popLayout), so the preview grows into the space
  // they leave. An adopted tile drops out of `tiles`, which ends focus mode.
  const focused = tiles.find((tile) => tile.item.key === expanded)
  const shown = focused === undefined ? tiles : [focused]

  return (
    <motion.section
      layout
      aria-labelledby={headingId}
      data-gallery={kind}
      data-focused={focused === undefined ? undefined : ""}
      style={{ borderRadius: 16 }}
      className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4"
    >
      <motion.div layout="position">
        <LibrarySectionHeader
          id={headingId}
          title={m.templates_settings_gallery_heading()}
          description={description}
        />
      </motion.div>
      <EasedHeight session={focused?.item.key ?? null}>
        <div className={cn(LIBRARY_GRID_CLASS, "relative")}>
          <AnimatePresence mode="popLayout" initial={false}>
            {shown.map((tile) => (
              <GalleryTile
                key={tile.item.key}
                kind={kind}
                item={tile.item}
                badge={tile.badge}
                sketch={tile.sketch}
                sketchNames={tile.sketchNames}
                preview={tile.preview}
                expanded={focused === tile}
                canAdd={canAdd}
                error={error?.key === tile.item.key ? error.message : null}
                onTogglePreview={() =>
                  setExpanded((current) =>
                    current === tile.item.key ? null : tile.item.key
                  )
                }
                onAdd={() => void add(tile)}
              />
            ))}
          </AnimatePresence>
        </div>
      </EasedHeight>
    </motion.section>
  )
}

type ScrollReturn = Readonly<{
  scroller: HTMLElement
  from: number
  height: number
  to: number
}>

function EasedHeight({
  session,
  children
}: Readonly<{ session: string | null; children: ReactNode }>) {
  const contentRef = useRef<HTMLDivElement>(null)
  const height = useMotionValue<number | "auto">("auto")
  const overflowY = useMotionValue<"visible" | "clip">("visible")
  const reduced = useReducedMotion() === true
  const savedScroll = useRef<number | null>(null)
  const scrollReturn = useRef<ScrollReturn | null>(null)
  const open = session !== null

  useLayoutEffect(() => {
    const scroller =
      contentRef.current?.closest<HTMLElement>("[data-scroll-root]") ?? null
    if (scroller === null) return
    if (open) {
      savedScroll.current = scroller.scrollTop
      scrollReturn.current = null
      return
    }
    const to = savedScroll.current
    const current = height.get()
    savedScroll.current = null
    if (to === null || current === "auto" || scroller.scrollTop >= to) return
    scrollReturn.current = {
      scroller,
      from: scroller.scrollTop,
      height: current,
      to
    }
  }, [height, open])

  useLayoutEffect(() => {
    const content = contentRef.current
    if (content === null) return undefined
    let width: number | null = null
    let target: number | null = null
    const observer = new ResizeObserver(() => {
      const next = content.offsetHeight
      const resized = width !== content.offsetWidth
      width = content.offsetWidth
      if (next === target && !resized) return
      target = next
      if (resized || reduced || height.get() === next) {
        height.jump(next)
        overflowY.set("visible")
        return
      }
      overflowY.set("clip")
      void animate(height, next, transitions.layout)
    })
    const unsubscribe = height.on("change", (value) => {
      overflowY.set(value === target ? "visible" : "clip")
      const back = scrollReturn.current
      if (back === null || value === "auto") return
      if (value === target) scrollReturn.current = null
      frame.postRender(() => {
        back.scroller.scrollTop = Math.min(
          back.to,
          back.from + Math.max(0, value - back.height)
        )
      })
    })
    observer.observe(content)
    return () => {
      observer.disconnect()
      unsubscribe()
    }
  }, [height, overflowY, reduced])

  return (
    <motion.div style={{ height, overflowY }}>
      <div ref={contentRef}>{children}</div>
    </motion.div>
  )
}
