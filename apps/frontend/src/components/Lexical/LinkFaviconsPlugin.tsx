import { $isLinkNode, AutoLinkNode, LinkNode } from "@lexical/link"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { mergeRegister } from "@lexical/utils"
import { $getNodeByKey, type NodeKey, type NodeMutation } from "lexical"
import { useCallback, useEffect, useState } from "react"

import { previewableUrl } from "@/features/linkPreviews/linkPreviewUrl"
import {
  paintLinkFavicon,
  useLinkPreview,
  type LinkFavicon
} from "@/features/linkPreviews/useLinkPreview"

const PENDING: LinkFavicon = { kind: "pending" }
const SETTLE_MS = 400

export function LinkFaviconsPlugin() {
  const [editor] = useLexicalComposerContext()
  const [links, setLinks] = useState<ReadonlyMap<NodeKey, string>>(
    () => new Map()
  )
  const [favicons, setFavicons] = useState<ReadonlyMap<string, LinkFavicon>>(
    () => new Map()
  )

  useEffect(() => {
    const pending = new Map<NodeKey, string | null>()
    let timer: number | undefined
    let registered = false
    const flush = () => {
      timer = undefined
      const changes = [...pending]
      pending.clear()
      setLinks((current) => {
        const next = new Map(current)
        for (const [key, url] of changes) {
          if (url === null) next.delete(key)
          else next.set(key, url)
        }
        return next
      })
    }
    const track = (mutations: Map<NodeKey, NodeMutation>) => {
      editor.getEditorState().read(() => {
        for (const [key, mutation] of mutations) {
          const node = mutation === "destroyed" ? null : $getNodeByKey(key)
          pending.set(
            key,
            $isLinkNode(node) ? previewableUrl(node.getURL()) : null
          )
        }
      })
      window.clearTimeout(timer)
      if (registered) timer = window.setTimeout(flush, SETTLE_MS)
      else flush()
    }
    const unregister = mergeRegister(
      editor.registerMutationListener(LinkNode, track),
      editor.registerMutationListener(AutoLinkNode, track)
    )
    registered = true
    return () => {
      window.clearTimeout(timer)
      unregister()
    }
  }, [editor])

  useEffect(() => {
    const paint = () => {
      for (const [key, url] of links) {
        const element = editor.getElementByKey(key)
        if (element !== null) {
          paintLinkFavicon(element, favicons.get(url) ?? PENDING)
        }
      }
    }
    paint()
    return editor.registerUpdateListener(paint)
  }, [editor, links, favicons])

  const report = useCallback((url: string, favicon: LinkFavicon) => {
    setFavicons((current) =>
      current.get(url) === favicon
        ? current
        : new Map(current).set(url, favicon)
    )
  }, [])

  return [...new Set(links.values())].map((url) => (
    <FaviconSource key={url} url={url} onResolve={report} />
  ))
}

function FaviconSource({
  url,
  onResolve
}: Readonly<{
  url: string
  onResolve: (url: string, favicon: LinkFavicon) => void
}>) {
  const { favicon } = useLinkPreview(url)
  useEffect(() => onResolve(url, favicon), [url, favicon, onResolve])
  return null
}
