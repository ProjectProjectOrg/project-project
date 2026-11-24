import { Badge } from "../../components/badge"
import { m } from "../messages"
import { PaperGlyph } from "./paper-glyph"

// Figma and attachment chips), and a 24px target that opens it in Paper.
export function PaperChip({
  url,
  label
}: Readonly<{ url: string; label: string }>) {
  const name = label.trim() || m.editor_paper_default_name()
  return (
    <Badge
      render={
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          data-chip-action=""
        />
      }
      size="xs"
      className="inline-chip mx-0.5 max-w-full gap-1 text-caption select-none"
      contentEditable={false}
    >
      <span className="flex size-3 shrink-0">
        <PaperGlyph className="size-3" />
      </span>
      <span className="truncate">{name}</span>
    </Badge>
  )
}
