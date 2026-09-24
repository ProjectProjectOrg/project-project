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
import { AnimatePresence, motion } from "motion/react"
import { useMemo, useState, type ReactNode } from "react"

import { LibraryContext } from "@/components/blocks/blockChrome"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { sketchLines, templateSketch, type SketchBlock } from "./blockSketch"
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
    </motion.section>
  )
}
