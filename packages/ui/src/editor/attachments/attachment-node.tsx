import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  attachmentDownloadSrc,
  attachmentFileFormat,
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
import { useState, type ReactElement } from "react"

import { AttachmentChip } from "../../components/attachment-chip"
import {
  AttachmentFailed,
  AttachmentUnavailable,
  AttachmentUploading
} from "../../components/attachment-status"
import { AttachmentTile } from "../../components/attachment-tile"
import { AttachmentVideo } from "../../components/attachment-video"
import { m } from "../messages"
import { useEditorServices } from "../services"
import { AttachmentImage } from "./attachment-image"
import {
  attachmentFailedLabels,
  attachmentTileLabels,
  attachmentVideoLabels
} from "./attachment-labels"
import { AttachmentSelectable } from "./attachment-selectable"
import { useAttachmentResolves } from "./availability"

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
          <AttachmentFailed
            uploadId={this.__uploadId}
            filename={this.__filename}
            labels={attachmentFailedLabels()}
          />
        ) : (
          <AttachmentUploading
            label={m.editor_attachment_uploading()}
            progress={this.__progress}
            filename={this.__filename}
          />
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
  const { renderPdf } = useEditorServices()
  const [broken, setBroken] = useState(false)
  const [unplayable, setUnplayable] = useState(false)
  const resolves = useAttachmentResolves(url)
  const missing = broken || !resolves
  const morphId = `attachment-${nodeKey}`
  const video =
    kind === "file" &&
    attachmentFileFormat(filename) === "video" &&
    !missing &&
    !unplayable
  const clipRadius = density === "compact" ? 10 : 18

  return (
    <AttachmentSelectable
      nodeKey={nodeKey}
      deletable
      density={density}
      clipRadius={video ? clipRadius : undefined}
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
          label={m.editor_attachment_unavailable()}
          variant={density === "compact" ? "inline" : "block"}
        />
      ) : density === "compact" ? (
        <AttachmentChip
          url={url}
          alt={alt}
          filename={filename}
          kind={kind}
          morphId={morphId}
          downloadLabel={m.editor_attachment_download()}
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
      ) : video ? (
        <AttachmentVideo
          src={url}
          filename={filename}
          downloadHref={attachmentDownloadSrc(url)}
          labels={attachmentVideoLabels()}
          onUnplayable={() => setUnplayable(true)}
        />
      ) : (
        <AttachmentTile
          url={url}
          alt={alt}
          filename={filename}
          morphId={morphId}
          labels={attachmentTileLabels()}
          renderPdf={renderPdf}
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
