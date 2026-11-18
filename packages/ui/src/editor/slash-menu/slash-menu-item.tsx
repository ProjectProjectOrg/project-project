import type { BlockDefinition, BlockIconName } from "@pp/shared"

import { LibraryBig } from "../../components/icons"
import {
  BASIC_BLOCK_ICONS,
  type BasicBlockKind
} from "../../editor/basic-blocks"
import type { IconComponent } from "../../lib/icon"
import { BlockIconGlyph } from "../blocks/block-icon-glyph"
import { blockIconComponent } from "../blocks/block-icons"
import { m } from "../messages"
import type { SlashItem, SlashSectionKey, SlashTab } from "./slash-menu-items"
import { BASIC_LITERALS } from "./slash-menu-preview"

// How each slash menu item is named, drawn and annotated.

const BASIC_LABELS: Record<BasicBlockKind, () => string> = {
  paragraph: m.editor_slash_basic_paragraph,
  "heading-1": m.editor_slash_basic_heading_1,
  "heading-3": m.editor_slash_basic_heading_3,
  "heading-4": m.editor_slash_basic_heading_4,
  "heading-5": m.editor_slash_basic_heading_5,
  "heading-6": m.editor_slash_basic_heading_6,
  heading: m.editor_slash_basic_heading,
  checklist: m.editor_slash_basic_checklist,
  "bullet-list": m.editor_slash_basic_bullet_list,
  "numbered-list": m.editor_slash_basic_numbered_list,
  code: m.editor_slash_basic_code,
  quote: m.editor_slash_basic_quote,
  divider: m.editor_slash_basic_divider,
  table: m.editor_slash_basic_table,
  hint: m.editor_slash_basic_hint
}

export const SECTION_LABELS: Record<SlashSectionKey, () => string> = {
  suggested: m.editor_slash_section_suggested,
  blocks: m.editor_slash_section_blocks,
  basic: m.editor_slash_section_basic
}

export const TAB_LABELS: Record<SlashTab, () => string> = {
  all: m.editor_slash_tab_all,
  blocks: m.editor_slash_section_blocks,
  markdown: m.editor_slash_section_basic
}

const ORIGIN_LABELS = {
  builtin: m.editor_block_origin_builtin,
  org: m.editor_block_origin_org,
  project: m.editor_block_origin_project
}

export const basicLabel = (kind: BasicBlockKind): string => BASIC_LABELS[kind]()

export function ItemIcon({ item }: Readonly<{ item: SlashItem }>) {
  if (item.kind === "block")
    return (
      <BlockIconGlyph
        icon={item.definition.icon}
        color={item.definition.color}
      />
    )
  const Icon =
    item.kind === "gallery" ? LibraryBig : BASIC_BLOCK_ICONS[item.basic]
  return (
    <Icon
      aria-hidden
      strokeWidth={1.75}
      className="size-4 shrink-0 text-muted-foreground"
    />
  )
}

const glyphs = new Map<string, IconComponent>()

const glyphIcon = (
  icon: BlockIconName,
  color: string | null
): IconComponent => {
  const key = `${icon}:${color ?? ""}`
  const cached = glyphs.get(key)
  if (cached !== undefined) return cached
  const Icon = blockIconComponent(icon)
  const Glyph: IconComponent = ({ size, strokeWidth, className }) => (
    <Icon
      aria-hidden
      data-block-icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      style={color === null ? undefined : { color }}
    />
  )
  glyphs.set(key, Glyph)
  return Glyph
}

export const itemIcon = (item: SlashItem): IconComponent => {
  if (item.kind === "block")
    return glyphIcon(item.definition.icon, item.definition.color)
  return item.kind === "gallery" ? LibraryBig : BASIC_BLOCK_ICONS[item.basic]
}

export const itemName = (item: SlashItem): string => {
  if (item.kind === "block") return item.definition.name
  if (item.kind === "gallery") return m.editor_slash_gallery_blocks()
  return basicLabel(item.basic)
}

const blockMeta = (definition: BlockDefinition): string | null => {
  if (definition.sync) return m.editor_slash_synced()
  return ORIGIN_LABELS[definition.origin]()
}

export const itemMeta = (item: SlashItem): string | null => {
  if (item.kind === "block")
    return item.suggestedBy ?? blockMeta(item.definition)
  if (item.kind === "gallery") return m.editor_slash_gallery_browse()
  return null
}

export const itemLiteral = (item: SlashItem): string | null =>
  item.kind === "basic" ? BASIC_LITERALS[item.basic] : null

export const itemShortcut = (item: SlashItem): string | null =>
  item.kind === "block" && item.definition.sync
    ? m.editor_slash_copy_hint()
    : null
