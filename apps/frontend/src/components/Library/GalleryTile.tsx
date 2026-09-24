import type { BlockIconName } from "@pp/shared"
import { motion } from "motion/react"
import type { ReactNode, Ref } from "react"

import { Markdown } from "@/components/Markdown"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { BlockIconGlyph } from "./BlockIconGlyph"
import { BlockSketch } from "./BlockSketch"
import type { SketchBlock } from "./blockSketch"
import { layoutIdFor, type LibraryKind } from "./libraryModel"

export type GalleryItem = Readonly<{
  key: string
  name: string
  icon: BlockIconName
  color: string | null
  description: string
}>

type GalleryTileProps = Readonly<{
  ref?: Ref<HTMLDivElement>
  kind: LibraryKind
  item: GalleryItem
  badge: ReactNode
  sketch: ReadonlyArray<SketchBlock>
  sketchNames: boolean
  preview: string
  expanded: boolean
  canAdd: boolean
  error: string | null
  onTogglePreview: () => void
  onAdd: () => void
}>

/**
 * A gallery entry. Every moving part (the tile, its header, description,
 * sketch, preview and buttons) takes the one layout transition from the
 * page's `MotionConfig`, and every text element animates by position only,
 * so nothing is scaled or left behind while the tile grows into a preview.
 * The tile forwards its ref so `AnimatePresence mode="popLayout"` can lift
 * it out of the grid while it fades.
 */
export function GalleryTile({
  ref,
  kind,
  item,
  badge,
  sketch,
  sketchNames,
  preview,
  expanded,
  canAdd,
  error,
  onTogglePreview,
  onAdd
}: GalleryTileProps) {
  return (
    <motion.div
      ref={ref}
      layout
      layoutId={layoutIdFor(kind, item.key)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-gallery-tile={item.key}
      data-expanded={expanded ? "" : undefined}
      style={{ borderRadius: 14 }}
      className={cn(
        "group/reveal flex flex-col gap-2 rounded-md bg-surface-3 p-3 shadow-surface-1 transition-colors",
        expanded ? "block-rail-scope col-span-full gap-3" : "hover:bg-accent/40"
      )}
    >
      <motion.div layout="position" className="flex items-center gap-2">
        <BlockIconGlyph icon={item.icon} color={item.color} />
        <motion.span
          initial={false}
          animate={{ fontSize: expanded ? "1.25rem" : "0.875rem" }}
          className={cn(
            "min-w-0 flex-1 truncate leading-snug",
            expanded ? "font-semibold tracking-[-0.01em]" : "font-medium"
          )}
        >
          {item.name}
        </motion.span>
        {badge}
      </motion.div>
      <motion.p
        layout="position"
        className={cn(
          "text-xs text-foreground/80",
          expanded && "-mt-1 text-muted-foreground"
        )}
      >
        {item.description}
      </motion.p>
      {expanded ? (
        <motion.div
          layout="position"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          data-gallery-preview
          className="block-rail-sheet ml-(--ticket-rail-inset) px-(--ticket-comment-pad)"
        >
          <Markdown className="text-sm">{preview}</Markdown>
        </motion.div>
      ) : (
        <motion.div layout="position">
          <BlockSketch
            blocks={sketch}
            names={sketchNames}
            height={sketchNames ? "tall" : "short"}
          />
        </motion.div>
      )}
      {error === null ? null : (
        <motion.p
          layout="position"
          role="alert"
          className="text-xs text-destructive"
        >
          {error}
        </motion.p>
      )}
      <motion.div
        layout="position"
        className={cn(
          "mt-auto flex items-center gap-1 transition-opacity",
          expanded
            ? "ml-(--ticket-rail-inset)"
            : "opacity-0 group-focus-within/reveal:opacity-100 group-hover/reveal:opacity-100"
        )}
      >
        <Button
          type="button"
          variant="raised"
          size="xs"
          aria-expanded={expanded}
          onClick={onTogglePreview}
        >
          {expanded
            ? m.templates_settings_gallery_close()
            : m.templates_settings_gallery_preview()}
        </Button>
        {canAdd ? (
          <Button type="button" variant="raised" size="xs" onClick={onAdd}>
            {m.templates_settings_gallery_add()}
          </Button>
        ) : null}
      </motion.div>
    </motion.div>
  )
}
