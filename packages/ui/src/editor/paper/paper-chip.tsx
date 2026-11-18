import { Badge } from "../../components/badge"
import { ExternalLink } from "../../components/icons"
import { chipIconActionClass } from "../../components/morph-icon-link"
import { cn } from "../../lib/utils"
import { m } from "../messages"
import { PaperGlyph } from "./paper-glyph"

// A Paper file in the text: its glyph and name on a soft xs Badge (like the
// Figma and attachment chips), and a 24px target that opens it in Paper.
export function PaperChip({
  url,
  label
}: Readonly<{ url: string; label: string }>) {
  const name = label.trim() || m.editor_paper_default_name()
  return (
    <Badge
      size="xs"
      className="inline-chip mx-0.5 max-w-full gap-1 text-caption"
      contentEditable={false}
    >
      {/* Wrapped, so Badge's leading-icon inset doesn't apply: the logo sits
          as far from the start as the open icon does from the end. */}
      <span className="flex size-3 shrink-0">
        <PaperGlyph className="size-3" />
      </span>
      <span className="truncate">{name}</span>
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        data-paper-action="open"
        data-chip-action=""
        aria-label={m.editor_paper_open()}
        title={m.editor_paper_open()}
        onMouseDown={(event) => event.stopPropagation()}
        className={cn(chipIconActionClass, "-mr-1.5")}
      >
        <ExternalLink strokeWidth={1.75} className="size-3" aria-hidden />
      </a>
    </Badge>
  )
}
