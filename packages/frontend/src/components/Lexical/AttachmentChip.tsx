import { useState } from "react"
import { Download, FileText, Image as ImageIcon } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { m } from "@/paraglide/messages"

const CHIP =
  "inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 py-0.5 align-middle text-xs transition-colors duration-100 hover:bg-accent/40"

const HOVER_DELAY_MS = 450

function ChipBody({
  filename,
  kind
}: {
  filename: string
  kind: "image" | "file"
}) {
  const Icon = kind === "image" ? ImageIcon : FileText
  return (
    <>
      <Icon
        strokeWidth={1.75}
        className="size-3 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="truncate">{filename}</span>
    </>
  )
}

function DownloadIcon({ url, filename }: { url: string; filename: string }) {
  return (
    <a
      href={url}
      download={filename}
      aria-label={m.editor_attachment_download()}
      title={m.editor_attachment_download()}
      onMouseDown={(event) => event.stopPropagation()}
      className="shrink-0 rounded text-muted-foreground transition-colors duration-100 hover:text-foreground"
    >
      <Download strokeWidth={1.75} className="size-3" aria-hidden="true" />
    </a>
  )
}

export function AttachmentChip({
  url,
  alt,
  filename,
  kind
}: {
  url: string
  alt: string
  filename: string
  kind: "image" | "file"
}) {
  const [broken, setBroken] = useState(false)

  if (kind !== "image" || broken) {
    return (
      <span className={CHIP}>
        <ChipBody filename={filename} kind={kind} />
        <DownloadIcon url={url} filename={filename} />
      </span>
    )
  }

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={HOVER_DELAY_MS}
        render={<span className={CHIP} />}
        contentEditable={false}
      >
        <ChipBody filename={filename} kind={kind} />
        <DownloadIcon url={url} filename={filename} />
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-sm p-1.5" align="start">
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="block max-h-72 max-w-full rounded-md object-contain"
          onError={() => setBroken(true)}
        />
      </PopoverContent>
    </Popover>
  )
}
