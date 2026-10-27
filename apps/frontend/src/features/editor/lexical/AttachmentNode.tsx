import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  ATTACHMENT_MIN_WIDTH,
  clampAttachmentWidth,
  type AttachmentDensity
} from "@pp/shared"
import {
  $applyNodeReplacement,
  $getNodeByKey,
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical"
import { motion, type MotionProps } from "motion/react"
import { useRef, useState, type ReactElement } from "react"

import { Button } from "@/components/ui/button"
import { AttachmentChip } from "@/features/attachments/components/AttachmentChip"
import {
  ATTACHMENT_IMAGE_CLASS,
  attachmentWidthStyle
} from "@/features/editor/lexical/attachmentImageStyle"
import { AttachmentTile } from "@/features/editor/lexical/AttachmentTile"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { useAttachmentResolves } from "./attachmentAvailability"
import { AttachmentSelectable } from "./AttachmentSelectable"
import { AttachmentUnavailable } from "./AttachmentUnavailable"

export type AttachmentKind = "image" | "file"

export interface AttachmentPayload {
  readonly url: string
  readonly alt: string
  readonly filename: string
  readonly kind: AttachmentKind
  readonly uploadId?: string
  readonly progress?: number
  readonly width?: number | null
  readonly failed?: boolean
  readonly density?: AttachmentDensity
}

export type SerializedAttachmentNode = Spread<
  {
    url: string
    alt: string
    filename: string
    kind: AttachmentKind
    width: number | null
    density: AttachmentDensity
  },
  SerializedLexicalNode
>

const contentWidth = (element: HTMLElement | null): number | null => {
  if (element === null) return null
  const style = getComputedStyle(element)
  const inner =
    element.clientWidth -
    Number.parseFloat(style.paddingLeft) -
    Number.parseFloat(style.paddingRight)
  return Number.isFinite(inner) && inner > 0 ? inner : null
}

function AttachmentImage({
  url,
  alt,
  width,
  nodeKey,
  onBroken
}: {
  url: string
  alt: string
  width: number | null
  nodeKey: NodeKey
  onBroken: () => void
}) {
  const [editor] = useLexicalComposerContext()
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const dragStart = useRef<{ width: number; container: number } | null>(null)

  const measure = (offsetX: number): number => {
    const img = imgRef.current
    const start = dragStart.current
    if (!img || !start) return ATTACHMENT_MIN_WIDTH
    return clampAttachmentWidth({
      width: start.width + offsetX,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      containerWidth: start.container
    })
  }

  const onPanStart = () => {
    const img = imgRef.current
    if (!img) return
    const width = img.getBoundingClientRect().width
    dragStart.current = {
      width,
      container: contentWidth(editor.getRootElement()) ?? width
    }
  }

  const onPan: MotionProps["onPan"] = (_event, info) => {
    if (!dragStart.current) return
    setDragWidth(measure(info.offset.x))
  }

  const onPanEnd: MotionProps["onPanEnd"] = (_event, info) => {
    if (!dragStart.current) return
    const next = measure(info.offset.x)
    dragStart.current = null
    setDragWidth(null)
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isAttachmentNode(node)) node.setWidth(next)
    })
  }

  const effectiveWidth = dragWidth ?? width

  return (
    <span className="relative block w-fit max-w-full">
      <img
        ref={imgRef}
        src={url}
        alt={alt}
        decoding="async"
        style={attachmentWidthStyle(effectiveWidth)}
        className={cn(
          ATTACHMENT_IMAGE_CLASS,
          "border border-transparent transition-colors group-focus-within/editing:group-hover/hitbox:border-border"
        )}
        onError={onBroken}
      />
      <motion.span
        role="presentation"
        aria-hidden="true"
        data-attachment-resize="true"
        onPanStart={onPanStart}
        onPan={onPan}
        onPanEnd={onPanEnd}
        className="invisible absolute top-1/2 right-0 hidden h-8 max-h-[60%] w-1.5 translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-foreground/40 opacity-0 transition-all group-focus-within/editing:visible group-hover/hitbox:opacity-100 before:absolute before:-inset-x-2 before:inset-y-0 before:content-[''] hover:bg-foreground/80 sm:block"
      />
    </span>
  )
}

function AttachmentFailed({ uploadId }: { uploadId: string | undefined }) {
  return (
    <span className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
      <span className="flex-1 truncate text-destructive">
        {m.editor_attachment_upload_failed()}
      </span>
      {(
        [
          ["retry", m.editor_attachment_retry],
          ["remove", m.editor_attachment_remove]
        ] as const
      ).map(([action, label]) => (
        <Button
          key={action}
          variant="ghost"
          size="sm"
          data-attachment-action={action}
          data-attachment-upload-id={uploadId}
        >
          {label()}
        </Button>
      ))}
    </span>
  )
}

function AttachmentUploading({ progress }: { progress: number }) {
  const percent = Math.round(Math.min(Math.max(progress, 0), 1) * 100)
  return (
    <span className="flex min-h-[8rem] w-[20rem] max-w-full flex-col justify-center gap-2 rounded-lg border border-dashed px-3 py-2">
      <span className="truncate text-xs text-muted-foreground">
        {m.editor_attachment_uploading()}
      </span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary transition-all duration-150"
          style={{ width: `${percent}%` }}
        />
      </span>
    </span>
  )
}

export class AttachmentNode extends DecoratorNode<ReactElement> {
  __url: string
  __alt: string
  __filename: string
  __kind: AttachmentKind
  __uploadId: string | undefined
  __progress: number
  __width: number | null
  __failed: boolean
  __density: AttachmentDensity

  static getType(): string {
    return "attachment"
  }

  static clone(node: AttachmentNode): AttachmentNode {
    return new AttachmentNode(
      {
        url: node.__url,
        alt: node.__alt,
        filename: node.__filename,
        kind: node.__kind,
        uploadId: node.__uploadId,
        progress: node.__progress,
        width: node.__width,
        failed: node.__failed,
        density: node.__density
      },
      node.__key
    )
  }

  constructor(payload: AttachmentPayload, key?: NodeKey) {
    super(key)
    this.__url = payload.url
    this.__alt = payload.alt
    this.__filename = payload.filename
    this.__kind = payload.kind
    this.__uploadId = payload.uploadId
    this.__progress = payload.progress ?? 0
    this.__width = payload.width ?? null
    this.__failed = payload.failed ?? false
    this.__density = payload.density ?? "rich"
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span")
    span.setAttribute("data-attachment-kind", this.__kind)
    span.style.display = "inline-block"
    span.style.verticalAlign = "middle"
    span.style.maxWidth = "100%"
    return span
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return true
  }

  getTextContent(): string {
    return this.__filename
  }

  getUrl(): string {
    return this.getLatest().__url
  }

  getAlt(): string {
    return this.getLatest().__alt
  }

  getFilename(): string {
    return this.getLatest().__filename
  }

  getKind(): AttachmentKind {
    return this.getLatest().__kind
  }

  getUploadId(): string | undefined {
    return this.getLatest().__uploadId
  }

  getProgress(): number {
    return this.getLatest().__progress
  }

  getFailed(): boolean {
    return this.getLatest().__failed
  }

  getWidth(): number | null {
    return this.getLatest().__width
  }

  setWidth(width: number | null): void {
    const writable = this.getWritable()
    writable.__width = width
  }

  getDensity(): AttachmentDensity {
    return this.getLatest().__density
  }

  setDensity(density: AttachmentDensity): void {
    const writable = this.getWritable()
    writable.__density = density
  }

  setProgress(fraction: number): void {
    const writable = this.getWritable()
    writable.__progress = fraction
  }

  setFailed(failed: boolean): void {
    const writable = this.getWritable()
    writable.__failed = failed
  }

  setCommitted(url: string): void {
    const writable = this.getWritable()
    writable.__url = url
    writable.__uploadId = undefined
    writable.__failed = false
    writable.__progress = 1
  }

  exportJSON(): SerializedAttachmentNode {
    return {
      ...super.exportJSON(),
      type: "attachment",
      version: 1,
      url: this.__url,
      alt: this.__alt,
      filename: this.__filename,
      kind: this.__kind,
      width: this.__width,
      density: this.__density
    }
  }

  static importJSON(serialized: SerializedAttachmentNode): AttachmentNode {
    return $createAttachmentNode({
      url: serialized.url,
      alt: serialized.alt,
      filename: serialized.filename,
      kind: serialized.kind,
      width: serialized.width ?? null,
      density: serialized.density ?? "rich"
    })
  }

  decorate(): ReactElement {
    const settled = this.__uploadId === undefined && !this.__failed

    if (settled) {
      return (
        <AttachmentSettled
          nodeKey={this.getKey()}
          url={this.__url}
          alt={this.__alt}
          filename={this.__filename}
          kind={this.__kind}
          width={this.__width}
          density={this.__density}
        />
      )
    }

    return (
      <AttachmentSelectable
        nodeKey={this.getKey()}
        deletable={!this.__failed}
        density={this.__density}
      >
        {this.__failed ? (
          <AttachmentFailed uploadId={this.__uploadId} />
        ) : (
          <AttachmentUploading progress={this.__progress} />
        )}
      </AttachmentSelectable>
    )
  }
}

function AttachmentSettled({
  nodeKey,
  url,
  alt,
  filename,
  kind,
  width,
  density
}: {
  nodeKey: NodeKey
  url: string
  alt: string
  filename: string
  kind: "image" | "file"
  width: number | null
  density: AttachmentDensity
}) {
  const [editor] = useLexicalComposerContext()
  const [broken, setBroken] = useState(false)
  const resolves = useAttachmentResolves(url)
  const missing = broken || !resolves
  const morphId = `attachment-${nodeKey}`

  return (
    <AttachmentSelectable
      nodeKey={nodeKey}
      deletable
      density={density}
      onToggleDensity={() =>
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (!$isAttachmentNode(node)) return
          node.setDensity(node.getDensity() === "compact" ? "rich" : "compact")
        })
      }
    >
      {missing ? (
        <AttachmentUnavailable
          variant={density === "compact" ? "inline" : "block"}
        />
      ) : density === "compact" ? (
        <AttachmentChip
          url={url}
          alt={alt}
          filename={filename}
          kind={kind}
          morphId={morphId}
          onBroken={() => setBroken(true)}
        />
      ) : kind === "image" ? (
        <AttachmentImage
          url={url}
          alt={alt}
          width={width}
          nodeKey={nodeKey}
          onBroken={() => setBroken(true)}
        />
      ) : (
        <AttachmentTile
          url={url}
          alt={alt}
          filename={filename}
          morphId={morphId}
        />
      )}
    </AttachmentSelectable>
  )
}

export function $createAttachmentNode(
  payload: AttachmentPayload
): AttachmentNode {
  return $applyNodeReplacement(new AttachmentNode(payload))
}

export function $isAttachmentNode(
  node: LexicalNode | null | undefined
): node is AttachmentNode {
  return node instanceof AttachmentNode
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot!.invalidate()
  })
}
