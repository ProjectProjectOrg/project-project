import { Button } from "@pp/ui/button"
import {
  Bold,
  Code,
  Heading2,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  SquareCode,
  Strikethrough,
  TextQuote
} from "@pp/ui/icons"
import { ToggleGroup, ToggleGroupItem } from "@pp/ui/toggle-group"
import { TooltipGroup, TooltipGroupTrigger } from "@pp/ui/tooltip"
import { useState } from "react"

const TEXT_FORMATS = [
  { format: "bold", icon: Bold, label: "Bold" },
  { format: "italic", icon: Italic, label: "Italic" },
  { format: "strikethrough", icon: Strikethrough, label: "Strikethrough" },
  { format: "code", icon: Code, label: "Inline code" }
] as const

const BLOCKS = [
  { kind: "heading", icon: Heading2, label: "Heading 2" },
  { kind: "bullet-list", icon: List, label: "Bulleted list" },
  { kind: "numbered-list", icon: ListOrdered, label: "Numbered list" },
  { kind: "checklist", icon: ListTodo, label: "Checklist" },
  { kind: "quote", icon: TextQuote, label: "Quote" },
  { kind: "code", icon: SquareCode, label: "Code block" }
] as const

// The editor's formatting toolbar, shown over a text selection: text
// formats, link, then block types, all sharing one tooltip that glides
// along the row by pointer or by Tab.
export default function FormattingToolbar() {
  const [formats, setFormats] = useState<string[]>(["bold"])
  const [block, setBlock] = useState<string[]>([])

  return (
    <div className="flex flex-col items-center gap-3 pt-12">
      <TooltipGroup sideOffset={10}>
        <div
          role="toolbar"
          aria-label="Formatting"
          className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-card p-1"
        >
          <ToggleGroup
            multiple
            value={formats}
            onValueChange={setFormats}
            aria-label="Text formatting"
          >
            {TEXT_FORMATS.map(({ format, icon: Icon, label }) => (
              <TooltipGroupTrigger
                key={format}
                tooltip={label}
                render={<ToggleGroupItem value={format} aria-label={label} />}
              >
                <Icon className="size-3.5" />
              </TooltipGroupTrigger>
            ))}
          </ToggleGroup>
          <TooltipGroupTrigger
            tooltip="Link"
            render={
              <Button variant="toolbar" size="square-7" aria-label="Link" />
            }
          >
            <Link className="size-3.5" />
          </TooltipGroupTrigger>
          <div aria-hidden className="mx-1 h-4 w-px bg-border" />
          <ToggleGroup
            value={block}
            onValueChange={setBlock}
            aria-label="Block type"
          >
            {BLOCKS.map(({ kind, icon: Icon, label }) => (
              <TooltipGroupTrigger
                key={kind}
                tooltip={label}
                render={<ToggleGroupItem value={kind} aria-label={label} />}
              >
                <Icon className="size-3.5" />
              </TooltipGroupTrigger>
            ))}
          </ToggleGroup>
        </div>
      </TooltipGroup>
      <p className="max-w-sm text-center text-body text-muted-foreground">
        Select some text in a ticket description and this toolbar appears above
        it.
      </p>
    </div>
  )
}
