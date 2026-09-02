import { useAtomSet } from "@effect-atom/atom-react"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { useCallback, useEffect, useRef, useState, type JSX } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $insertNodes,
  $nodesOfType,
  COMMAND_PRIORITY_LOW,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
  PASTE_COMMAND
} from "lexical"
import {
  ATTACHMENT_MAX_BYTES,
  isAllowedAttachmentContentType,
  isRasterImageContentType,
  type TicketId
} from "@projectproject/shared"
import { uploadAttachmentAtom } from "@/atoms/attachments"
import { ticketKey } from "@/atoms/tickets"
import { useMountedRef } from "@/lib/useMountedRef"
import { m } from "@/paraglide/messages"
import { AttachmentNode, $createAttachmentNode } from "./AttachmentNode"

export interface AttachmentsPluginProps {
  readonly orgSlug: string
  readonly slug: string
  readonly ticketId: TicketId
}

export function AttachmentsPlugin({
  orgSlug,
  slug,
  ticketId
}: AttachmentsPluginProps): JSX.Element | null {
  const [editor] = useLexicalComposerContext()
  const upload = useAtomSet(
    uploadAttachmentAtom(ticketKey(orgSlug, slug, ticketId)),
    { mode: "promiseExit" }
  )
  const [rejection, setRejection] = useState<string | null>(null)
  const pendingFiles = useRef(new Map<string, File>())
  const mounted = useMountedRef()

  const withNode = useCallback(
    (uploadId: string, apply: (node: AttachmentNode) => void) => {
      if (!mounted.current) return
      editor.update(() => {
        for (const node of $nodesOfType(AttachmentNode)) {
          if (node.getUploadId() === uploadId) {
            apply(node)
            return
          }
        }
      })
    },
    [editor, mounted]
  )

  const startUpload = useCallback(
    (uploadId: string, file: File) => {
      void upload({
        file,
        onProgress: (fraction) => {
          withNode(uploadId, (node) => node.setProgress(fraction))
        }
      }).then((exit) => {
        if (!mounted.current) return
        if (Exit.isFailure(exit)) {
          Effect.runFork(
            Effect.logError(
              "[AttachmentsPlugin] upload failed",
              Cause.squash(exit.cause)
            )
          )
          withNode(uploadId, (node) => node.setFailed(true))
          return
        }
        const url = exit.value.url
        withNode(uploadId, (node) => node.setCommitted(url))
        pendingFiles.current.delete(uploadId)
      })
    },
    [upload, withNode, mounted]
  )

  const handleFiles = useCallback(
    (files: FileList | ReadonlyArray<File>) => {
      const list = Array.from(files)
      if (list.length === 0) return
      setRejection(null)
      for (const file of list) {
        if (!isAllowedAttachmentContentType(file.type)) {
          setRejection(m.editor_attachment_type_rejected())
          continue
        }
        if (file.size > ATTACHMENT_MAX_BYTES) {
          setRejection(m.editor_attachment_too_large())
          continue
        }
        // @effect-diagnostics-next-line cryptoRandomUUID:off
        const uploadId = crypto.randomUUID()
        pendingFiles.current.set(uploadId, file)
        editor.update(() => {
          $insertNodes([
            $createAttachmentNode({
              url: "",
              alt: file.name,
              filename: file.name,
              kind: isRasterImageContentType(file.type) ? "image" : "file",
              uploadId,
              progress: 0
            })
          ])
        })
        startUpload(uploadId, file)
      }
    },
    [editor, startUpload]
  )

  useEffect(() => {
    const unregisterPaste = editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (!(event instanceof ClipboardEvent)) return false
        const files = event.clipboardData?.files
        if (!files || files.length === 0) return false
        event.preventDefault()
        handleFiles(files)
        return true
      },
      COMMAND_PRIORITY_LOW
    )

    const unregisterDragover = editor.registerCommand(
      DRAGOVER_COMMAND,
      (event) => {
        const items = event.dataTransfer?.items
        if (!items) return false
        const hasFile = Array.from(items).some((item) => item.kind === "file")
        if (!hasFile) return false
        event.preventDefault()
        return true
      },
      COMMAND_PRIORITY_LOW
    )

    const unregisterDrop = editor.registerCommand(
      DROP_COMMAND,
      (event) => {
        const files = event.dataTransfer?.files
        if (!files || files.length === 0) return false
        event.preventDefault()
        handleFiles(files)
        return true
      },
      COMMAND_PRIORITY_LOW
    )

    return () => {
      unregisterPaste()
      unregisterDragover()
      unregisterDrop()
    }
  }, [editor, handleFiles])

  useEffect(
    () =>
      editor.registerRootListener((rootElement) => {
        if (rootElement === null) return
        const onClick = (event: MouseEvent) => {
          const target = event.target
          if (!(target instanceof Element)) return
          const button = target.closest<HTMLElement>("[data-attachment-action]")
          if (!button || !rootElement.contains(button)) return
          const uploadId = button.getAttribute("data-attachment-upload-id")
          if (!uploadId) return
          event.preventDefault()
          event.stopPropagation()
          if (button.getAttribute("data-attachment-action") === "remove") {
            pendingFiles.current.delete(uploadId)
            withNode(uploadId, (node) => node.remove())
            return
          }
          const file = pendingFiles.current.get(uploadId)
          if (!file) return
          withNode(uploadId, (node) => {
            node.setFailed(false)
            node.setProgress(0)
          })
          startUpload(uploadId, file)
        }
        rootElement.addEventListener("click", onClick, true)
        return () => {
          rootElement.removeEventListener("click", onClick, true)
        }
      }),
    [editor, startUpload, withNode]
  )

  if (rejection === null) return null

  return (
    <span className="mt-1 block text-xs text-destructive">{rejection}</span>
  )
}
