import {
  $applyNodeReplacement,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ESCAPE_COMMAND,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection"
import { mergeRegister } from "@lexical/utils"
import { Trash2 } from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode
} from "react"
import { clampAttachmentWidth } from "@projectproject/shared"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

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
}

export type SerializedAttachmentNode = Spread<
  {
    url: string
    alt: string
    filename: string
    kind: AttachmentKind
    width: number | null
  },
  SerializedLexicalNode
>

const PRESS = "active:scale-[0.97] transition-transform duration-100"

function AttachmentImage({
  url,
  alt,
  width,
  nodeKey
}: {
  url: string
  alt: string
  width: number | null
  nodeKey: NodeKey
}) {
  const [editor] = useLexicalComposerContext()
  const [broken, setBroken] = useState(false)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const onResize = (next: number | null) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isAttachmentNode(node)) node.setWidth(next)
    })
  }

  const startResize = (event: ReactPointerEvent<HTMLElement>) => {
    const img = imgRef.current
    if (!img) return
    event.preventDefault()
    event.stopPropagation()
    const handle = event.currentTarget
    try {
      handle.setPointerCapture(event.pointerId)
    } catch {
      // an already-released pointer cannot be captured; the window listeners still track it
    }

    const startX = event.clientX
    const startWidth = img.getBoundingClientRect().width
    const containerWidth =
      img.parentElement?.parentElement?.getBoundingClientRect().width ??
      startWidth

    const measure = (clientX: number) =>
      clampAttachmentWidth({
        width: startWidth + (clientX - startX),
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        containerWidth
      })

    const onMove = (moveEvent: PointerEvent) => {
      setDragWidth(measure(moveEvent.clientX))
    }

    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      setDragWidth(null)
      onResize(measure(upEvent.clientX))
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
  }

  if (broken) {
    return (
      <span className="block rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
        {m.editor_attachment_unavailable()}
      </span>
    )
  }

  const effectiveWidth = dragWidth ?? width

  return (
    <span className="relative block w-fit max-w-full">
      <img
        ref={imgRef}
        src={url}
        alt={alt}
        decoding="async"
        style={
          effectiveWidth === null ? undefined : { width: `${effectiveWidth}px` }
        }
        className="h-auto max-h-96 w-auto max-w-full rounded-lg border object-contain"
        onError={() => setBroken(true)}
      />
      {(["top", "bottom"] as const).map((corner) => (
        <span
          key={corner}
          role="presentation"
          aria-hidden="true"
          onPointerDown={startResize}
          className={`absolute -right-1.5 hidden h-3 w-3 cursor-ew-resize rounded-full border-2 border-background bg-foreground/70 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-foreground sm:block ${
            corner === "top" ? "-top-1.5" : "-bottom-1.5"
          }`}
        />
      ))}
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
        failed: node.__failed
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
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span")
    span.setAttribute("data-attachment-kind", this.__kind)
    span.style.display = "block"
    return span
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return false
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
      width: this.__width
    }
  }

  static importJSON(serialized: SerializedAttachmentNode): AttachmentNode {
    return $createAttachmentNode({
      url: serialized.url,
      alt: serialized.alt,
      filename: serialized.filename,
      kind: serialized.kind,
      width: serialized.width ?? null
    })
  }

  decorate(): ReactElement {
    return (
      <AttachmentSelectable nodeKey={this.getKey()} deletable={!this.__failed}>
        {this.renderContent()}
      </AttachmentSelectable>
    )
  }

  renderContent(): ReactElement {
    if (this.__failed) {
      return (
        <span className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
          <span className="flex-1 truncate text-destructive">
            {m.editor_attachment_upload_failed()}
          </span>
          <button
            type="button"
            data-attachment-action="retry"
            data-attachment-upload-id={this.__uploadId}
            className={`rounded-md px-2 py-1 text-muted-foreground hover:bg-accent/40 hover:text-foreground ${PRESS}`}
          >
            {m.editor_attachment_retry()}
          </button>
          <button
            type="button"
            data-attachment-action="remove"
            data-attachment-upload-id={this.__uploadId}
            className={`rounded-md px-2 py-1 text-muted-foreground hover:bg-accent/40 hover:text-foreground ${PRESS}`}
          >
            {m.editor_attachment_remove()}
          </button>
        </span>
      )
    }

    if (this.__uploadId !== undefined) {
      return (
        <span className="flex min-h-[8rem] w-[20rem] max-w-full flex-col justify-center gap-2 rounded-lg border border-dashed px-3 py-2">
          <span className="truncate text-xs text-muted-foreground">
            {m.editor_attachment_uploading()}
          </span>
          <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary transition-all duration-150"
              style={{
                width: `${Math.round(Math.min(Math.max(this.__progress, 0), 1) * 100)}%`
              }}
            />
          </span>
        </span>
      )
    }

    if (this.__kind === "image") {
      return (
        <AttachmentImage
          url={this.__url}
          alt={this.__alt}
          width={this.__width}
          nodeKey={this.getKey()}
        />
      )
    }

    return (
      <span className="flex w-fit max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs">
        <span className="truncate">{this.__filename}</span>
        <a
          href={this.__url}
          download={this.__filename}
          className={`rounded-md px-2 py-1 text-muted-foreground hover:bg-accent/40 hover:text-foreground ${PRESS}`}
        >
          {m.editor_attachment_download()}
        </a>
      </span>
    )
  }
}

function AttachmentSelectable({
  nodeKey,
  deletable,
  children
}: {
  nodeKey: string
  deletable: boolean
  children: ReactNode
}) {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey)

  const remove = useCallback(() => {
    editor.update(() => {
      $getNodeByKey(nodeKey)?.remove()
    })
  }, [editor, nodeKey])

  useEffect(() => {
    const onDelete = (event: KeyboardEvent) => {
      if (!isSelected || !$isNodeSelection($getSelection())) return false
      event.preventDefault()
      remove()
      return true
    }

    return mergeRegister(
      editor.registerCommand(
        CLICK_COMMAND,
        (event: MouseEvent) => {
          const element = editor.getElementByKey(nodeKey)
          const target = event.target
          if (!element || !(target instanceof Node)) return false
          if (!element.contains(target)) return false
          if (
            target instanceof Element &&
            target.closest("a, button, [data-attachment-action]")
          ) {
            return false
          }
          event.preventDefault()
          clearSelection()
          setSelected(true)
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (!isSelected) return false
          clearSelection()
          return true
        },
        COMMAND_PRIORITY_LOW
      )
    )
  }, [editor, nodeKey, isSelected, setSelected, clearSelection, remove])

  const selectOnPointer = (event: ReactMouseEvent<HTMLElement>) => {
    if (
      event.target instanceof Element &&
      event.target.closest("a, button, [data-attachment-action]")
    ) {
      return
    }
    event.preventDefault()
    const root = editor.getRootElement()
    if (root && document.activeElement !== root) {
      root.focus({ preventScroll: true })
    }
    clearSelection()
    setSelected(true)
  }

  return (
    <span className="block w-full" onMouseDown={selectOnPointer}>
      <span
        data-attachment-selected={isSelected ? "true" : undefined}
        className={`group relative my-2 block w-fit max-w-full rounded-xl ring-offset-2 ring-offset-background transition-shadow duration-150 ${
          isSelected ? "ring-2 ring-ring" : "ring-0 ring-transparent"
        }`}
      >
        {children}
        {deletable ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={m.editor_attachment_remove()}
            title={m.editor_attachment_remove()}
            onMouseDown={(event) => event.preventDefault()}
            onClick={remove}
            className="absolute -top-2 -left-2 rounded-full bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-destructive-light hover:text-destructive"
          >
            <Trash2 strokeWidth={1.75} />
          </Button>
        ) : null}
      </span>
    </span>
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
