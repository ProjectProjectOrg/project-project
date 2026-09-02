import {
  $applyNodeReplacement,
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical"
import { useState, type ReactElement } from "react"
import { m } from "@/paraglide/messages"

export type AttachmentKind = "image" | "file"

export interface AttachmentPayload {
  readonly url: string
  readonly alt: string
  readonly filename: string
  readonly kind: AttachmentKind
  readonly uploadId?: string
  readonly progress?: number
  readonly failed?: boolean
}

export type SerializedAttachmentNode = Spread<
  {
    url: string
    alt: string
    filename: string
    kind: AttachmentKind
  },
  SerializedLexicalNode
>

const PRESS = "active:scale-[0.97] transition-transform duration-100"

function AttachmentImage({ url, alt }: { url: string; alt: string }) {
  const [broken, setBroken] = useState(false)

  if (broken) {
    return (
      <span className="my-2 block rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
        {m.editor_attachment_unavailable()}
      </span>
    )
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className="my-2 max-w-full rounded-lg border"
      onError={() => setBroken(true)}
    />
  )
}

export class AttachmentNode extends DecoratorNode<ReactElement> {
  __url: string
  __alt: string
  __filename: string
  __kind: AttachmentKind
  __uploadId: string | undefined
  __progress: number
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
      kind: this.__kind
    }
  }

  static importJSON(serialized: SerializedAttachmentNode): AttachmentNode {
    return $createAttachmentNode({
      url: serialized.url,
      alt: serialized.alt,
      filename: serialized.filename,
      kind: serialized.kind
    })
  }

  decorate(): ReactElement {
    if (this.__failed) {
      return (
        <span className="my-2 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
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
        <span className="my-2 flex min-h-[8rem] w-full max-w-sm flex-col justify-center gap-2 rounded-lg border border-dashed px-3 py-2">
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
      return <AttachmentImage url={this.__url} alt={this.__alt} />
    }

    return (
      <span className="my-2 flex w-fit max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs">
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
