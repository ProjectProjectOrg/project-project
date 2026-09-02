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
import { Maximize2, Minimize2, Trash2 } from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode
} from "react"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import {
  ATTACHMENT_MIN_WIDTH,
  clampAttachmentWidth,
  type AttachmentDensity
} from "@projectproject/shared"
import { Button } from "@/components/ui/button"
import { AttachmentChip } from "@/components/Lexical/AttachmentChip"
import { AttachmentTile } from "@/components/Lexical/AttachmentTile"
import {
  MORPH,
  MORPH_EASING,
  MORPH_MS
} from "@/components/Lexical/attachmentMorph"
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

const PRESS = "active:scale-[0.97] transition-transform duration-100"

const morphSizes = new Map<string, { width: number; height: number }>()

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

  const onPan = (_event: unknown, info: { offset: { x: number } }) => {
    if (!dragStart.current) return
    setDragWidth(measure(info.offset.x))
  }

  const onPanEnd = (_event: unknown, info: { offset: { x: number } }) => {
    if (!dragStart.current) return
    const next = measure(info.offset.x)
    dragStart.current = null
    setDragWidth(null)
    onResize(next)
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
        className="h-auto max-h-96 w-auto max-w-full rounded-lg border border-transparent object-contain transition-all group-hover/hitbox:border-border"
        onError={() => setBroken(true)}
      />
      <motion.span
        role="presentation"
        aria-hidden="true"
        data-attachment-resize="true"
        onPanStart={onPanStart}
        onPan={onPan}
        onPanEnd={onPanEnd}
        className="absolute top-1/2 right-0 hidden h-8 max-h-[60%] w-1.5 -translate-y-1/2 translate-x-1/2 cursor-ew-resize touch-none rounded-full bg-foreground/40 opacity-0 transition-all group-hover/hitbox:opacity-100 hover:bg-foreground/80 before:absolute before:inset-y-0 before:-inset-x-2 before:content-[''] sm:block"
      />
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
    return (
      <AttachmentSelectable
        nodeKey={this.getKey()}
        deletable={!this.__failed}
        density={settled ? this.__density : null}
      >
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

    if (this.__density === "compact") {
      return (
        <AttachmentChip
          url={this.__url}
          alt={this.__alt}
          filename={this.__filename}
          kind={this.__kind}
          morphId={`attachment-${this.getKey()}`}
        />
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
      <AttachmentTile
        url={this.__url}
        alt={this.__alt}
        filename={this.__filename}
        morphId={`attachment-${this.getKey()}`}
      />
    )
  }
}

function AttachmentSelectable({
  nodeKey,
  deletable,
  density,
  children
}: {
  nodeKey: string
  deletable: boolean
  density: AttachmentDensity | null
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

  const wrapperRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const element = wrapperRef.current
    if (element === null) return undefined
    const rect = element.getBoundingClientRect()
    const next = { width: rect.width, height: rect.height }
    const previous = morphSizes.get(nodeKey) ?? null
    morphSizes.set(nodeKey, next)
    if (previous === null) return undefined
    if (
      Math.abs(previous.width - next.width) < 0.5 &&
      Math.abs(previous.height - next.height) < 0.5
    ) {
      return undefined
    }
    const animation = element.animate(
      [
        { width: `${previous.width}px`, height: `${previous.height}px` },
        { width: `${next.width}px`, height: `${next.height}px` }
      ],
      { duration: MORPH_MS, easing: MORPH_EASING }
    )
    return () => animation.cancel()
  }, [density, nodeKey])

  const toggleDensity = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!$isAttachmentNode(node)) return
      node.setDensity(node.getDensity() === "compact" ? "rich" : "compact")
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
            target.closest(
              "a, button, [data-attachment-action], [data-attachment-resize]"
            )
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
      event.target.closest(
        "a, button, [data-attachment-action], [data-attachment-resize]"
      )
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

  const compact = density === "compact"
  const overlaySlot = `absolute flex h-8 items-center ${
    compact
      ? "-top-1 before:absolute before:inset-y-0 before:-inset-x-3 before:content-['']"
      : "-top-2"
  }`
  const overlayReveal =
    "flex opacity-0 transition-opacity group-hover/hitbox:opacity-100 group-focus-within/hitbox:opacity-100"
  const overlayButton =
    "rounded-full bg-background text-muted-foreground shadow-sm"

  return (
    <span
      className="inline-block max-w-full align-middle"
      onMouseDown={selectOnPointer}
    >
      <span
        ref={wrapperRef}
        data-attachment-selected={isSelected ? "true" : undefined}
        className={`group/hitbox relative inline-block max-w-full align-middle ring-offset-2 ring-offset-background transition-shadow duration-150 hover:z-20 focus-within:z-20 ${
          compact ? "my-0.5 rounded-md" : "my-2 rounded-xl"
        } ${
          isSelected ? "z-20 ring-2 ring-ring" : "z-0 ring-0 ring-transparent"
        }`}
      >
        <LayoutGroup id={`attachment-${nodeKey}`}>
          <AnimatePresence initial={false} mode="popLayout">
            {compact ? (
              <motion.span
                key="compact"
                layoutId={`attachment-${nodeKey}`}
                transition={MORPH}
                className="block"
              >
                {children}
              </motion.span>
            ) : (
              <motion.span
                key="expanded"
                layoutId={`attachment-${nodeKey}`}
                transition={MORPH}
                className="block"
              >
                {children}
              </motion.span>
            )}
          </AnimatePresence>
          {deletable ? (
            <motion.span
              layoutId={`attachment-${nodeKey}-remove`}
              layout="position"
              transition={MORPH}
              className={`${overlaySlot} ${compact ? "-left-9" : "-left-2"}`}
            >
              <span className={overlayReveal}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.editor_attachment_remove()}
                  title={m.editor_attachment_remove()}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={remove}
                  className={`${overlayButton} hover:bg-destructive-light hover:text-destructive`}
                >
                  <Trash2 strokeWidth={1.75} />
                </Button>
              </span>
            </motion.span>
          ) : null}
          {density !== null ? (
            <motion.span
              layoutId={`attachment-${nodeKey}-density`}
              layout="position"
              transition={MORPH}
              className={`${overlaySlot} ${compact ? "-right-9" : "-right-2"}`}
            >
              <span className={overlayReveal}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    compact
                      ? m.editor_attachment_view_rich()
                      : m.editor_attachment_view_compact()
                  }
                  title={
                    compact
                      ? m.editor_attachment_view_rich()
                      : m.editor_attachment_view_compact()
                  }
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={toggleDensity}
                  className={`${overlayButton} hover:bg-accent hover:text-foreground`}
                >
                  {compact ? (
                    <Maximize2 strokeWidth={1.75} />
                  ) : (
                    <Minimize2 strokeWidth={1.75} />
                  )}
                </Button>
              </span>
            </motion.span>
          ) : null}
        </LayoutGroup>
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
