import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { AttachmentDownload } from "@/components/Lexical/AttachmentDownload"
import { FileText, Image as ImageIcon } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"

const CHIP_BASE =
  "inline-flex max-w-full items-center align-baseline text-xs transition-colors duration-100"

const CHIP_VARIANTS = {
  current:
    "mx-0.5 gap-1.5 rounded-md border border-border bg-card px-2 py-0.5 hover:bg-accent/40",
  snug: "mx-0.5 gap-1 rounded-md border border-border bg-card px-1.5 py-0 leading-5 hover:bg-accent/40",
  outline:
    "mx-0.5 gap-1.5 rounded-md border border-border px-2 py-0.5 hover:bg-accent/40",
  tint: "mx-0.5 gap-1.5 rounded-md bg-muted px-2 py-0.5 hover:bg-accent/60",
  shadow:
    "mx-0.5 gap-1.5 rounded-md bg-card px-2 py-0.5 shadow-[0_0_0_1px_var(--color-border),0_1px_2px_rgb(0_0_0/0.06)] hover:bg-accent/40",
  flat: "gap-1 rounded-sm px-0.5 hover:bg-accent/40",
  underline:
    "gap-1 border-b border-border px-0.5 hover:border-foreground/40 hover:bg-accent/30"
} as const

type ChipVariant = keyof typeof CHIP_VARIANTS

const DEFAULT_CHIP_VARIANT: ChipVariant = "current"

const isChipVariant = (value: string | null): value is ChipVariant =>
  value !== null && Object.hasOwn(CHIP_VARIANTS, value)

function useChipClassName(): string {
  const [variant, setVariant] = useState<ChipVariant>(DEFAULT_CHIP_VARIANT)

  useEffect(() => {
    const read = () => {
      const value = new URLSearchParams(window.location.search).get("chip")
      setVariant(isChipVariant(value) ? value : DEFAULT_CHIP_VARIANT)
    }
    read()
    window.addEventListener("popstate", read)
    return () => window.removeEventListener("popstate", read)
  }, [])

  return cn(CHIP_BASE, CHIP_VARIANTS[variant])
}

const HOVER_DELAY_MS = 450

function ChipBody({
  filename,
  kind,
  morphId
}: {
  filename: string
  kind: "image" | "file"
  morphId: string
}) {
  const Icon = kind === "image" ? ImageIcon : FileText
  return (
    <>
      <motion.span
        layout="position"
        transition={transitions.morph}
        className="flex shrink-0 items-center"
      >
        <Icon
          strokeWidth={1.75}
          className="size-3 text-muted-foreground"
          aria-hidden="true"
        />
      </motion.span>
      <motion.span
        layoutId={`${morphId}-filename`}
        layout="position"
        transition={transitions.morph}
        className="truncate"
      >
        {filename}
      </motion.span>
    </>
  )
}

export function AttachmentChip({
  url,
  alt,
  filename,
  kind,
  morphId,
  onBroken
}: {
  url: string
  alt: string
  filename: string
  kind: "image" | "file"
  morphId: string
  onBroken?: () => void
}) {
  const [broken, setBroken] = useState(false)
  const chip = useChipClassName()

  if (kind !== "image" || broken) {
    return (
      <span className={chip}>
        <ChipBody filename={filename} kind={kind} morphId={morphId} />
        <AttachmentDownload url={url} filename={filename} morphId={morphId} />
      </span>
    )
  }

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={HOVER_DELAY_MS}
        render={<span className={chip} />}
        contentEditable={false}
      >
        <ChipBody filename={filename} kind={kind} morphId={morphId} />
        <AttachmentDownload url={url} filename={filename} morphId={morphId} />
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-sm p-1.5" align="start">
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="block max-h-72 max-w-full rounded-md object-contain"
          onError={() => {
            setBroken(true)
            onBroken?.()
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
