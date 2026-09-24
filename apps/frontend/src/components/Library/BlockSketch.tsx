import { cva, type VariantProps } from "class-variance-authority"

import { MarqueeIfOverflow } from "@/components/MarqueeIfOverflow"
import { cn } from "@/lib/utils"

import { BlockIconGlyph } from "./BlockIconGlyph"
import type { SketchBlock, SketchLine } from "./blockSketch"

const BAR_WIDTHS = ["w-[82%]", "w-[58%]", "w-[70%]", "w-[46%]"] as const

function SketchMarker({ line }: Readonly<{ line: SketchLine }>) {
  if (line === "bullet")
    return <span className="size-1 shrink-0 rounded-full bg-current" />
  if (line === "number")
    return <span className="h-1 w-1.5 shrink-0 rounded-[1px] bg-current" />
  if (line === "task")
    return (
      <span className="size-2 shrink-0 rounded-[2px] border border-current" />
    )
  return null
}

function SketchRow({
  line,
  index
}: Readonly<{ line: SketchLine; index: number }>) {
  return (
    <span className="flex h-2 items-center gap-1.5 text-muted-foreground/45">
      <SketchMarker line={line} />
      <span
        className={cn(
          "h-1 rounded-full",
          line === "heading"
            ? "w-[36%] bg-muted-foreground/45"
            : cn(
                BAR_WIDTHS[index % BAR_WIDTHS.length],
                "bg-muted-foreground/25"
              )
        )}
      />
    </span>
  )
}

const sketchVariants = cva(
  "flex flex-col overflow-hidden [mask-image:linear-gradient(to_bottom,black_72%,transparent)]",
  {
    variants: {
      frame: {
        sheet:
          "gap-2 rounded-md bg-muted/70 px-2.5 py-2 transition-colors group-hover/reveal:bg-muted dark:bg-background/60 dark:group-hover/reveal:bg-background",
        bare: "gap-2"
      },
      height: {
        tall: "h-28",
        short: "h-16",
        auto: ""
      }
    },
    defaultVariants: { frame: "sheet", height: "auto" }
  }
)

export function BlockSketch({
  blocks,
  names = true,
  frame,
  height,
  className
}: Readonly<
  {
    blocks: ReadonlyArray<SketchBlock>
    names?: boolean
    className?: string
  } & VariantProps<typeof sketchVariants>
>) {
  return (
    <div
      aria-hidden
      data-block-sketch
      className={cn(sketchVariants({ frame, height }), className)}
    >
      {blocks.map((block) => (
        <div key={block.key} className="flex flex-col gap-1">
          {names ? (
            <span className="flex items-center gap-1.5 text-[11px] leading-4 font-medium text-foreground/80">
              <BlockIconGlyph
                icon={block.icon}
                color={block.color}
                className="size-3"
              />
              <span className="truncate">{block.name}</span>
            </span>
          ) : null}
          <span className={cn("flex flex-col gap-1", names && "pl-[18px]")}>
            {block.lines.map((line, index) => (
              <SketchRow key={index} line={line} index={index} />
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

export function BlockStrip({
  blocks,
  className
}: Readonly<{ blocks: ReadonlyArray<SketchBlock>; className?: string }>) {
  return (
    <MarqueeIfOverflow
      variant="strip"
      className={cn("text-xs text-muted-foreground", className)}
    >
      {blocks.map((block) => (
        <span key={block.key} className="flex shrink-0 items-center gap-1">
          <BlockIconGlyph
            icon={block.icon}
            color={block.color}
            className="size-3"
          />
          {block.name}
        </span>
      ))}
    </MarqueeIfOverflow>
  )
}
