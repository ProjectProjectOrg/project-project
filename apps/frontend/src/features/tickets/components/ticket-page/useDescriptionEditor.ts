import { useEditMode } from "@pp/ui/editor/use-edit-mode"
import { useHotkey } from "@tanstack/react-hotkeys"
import type { LexicalEditor } from "lexical"
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type RefObject
} from "react"

import { loadLexicalEditor } from "@/features/editor/components/LexicalEditor"
import { appHotkeys } from "@/lib/appHotkeys"

const readSelection = (root: HTMLElement | null) => {
  const body = root?.querySelector(".prose-md")
  const selection = window.getSelection()
  if (!body || !selection || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  if (
    !body.contains(range.startContainer) ||
    !body.contains(range.endContainer)
  )
    return null
  const prefix = document.createRange()
  prefix.selectNodeContents(body)
  prefix.setEnd(range.startContainer, range.startOffset)
  return { start: prefix.toString().length, text: range.toString() }
}

const selectDescriptionText = (
  root: HTMLElement,
  { start, text }: NonNullable<ReturnType<typeof readSelection>>
) => {
  const content = root.textContent ?? ""
  const index = content.indexOf(text)
  const offset = content.startsWith(text, start)
    ? start
    : index === content.lastIndexOf(text)
      ? index
      : -1
  if (offset < 0 || text === "") return
  const end = offset + text.length
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let position = 0
  let hasStart = false
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const next = position + (node.textContent?.length ?? 0)
    if (!hasStart && offset < next) {
      range.setStart(node, offset - position)
      hasStart = true
    }
    if (hasStart && end <= next) {
      range.setEnd(node, end - position)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
      return
    }
    position = next
  }
}

const importDescriptionEditor = async () => {
  try {
    const [Editor, templates] = await Promise.all([
      loadLexicalEditor(),
      import("./descriptionTemplates")
    ])
    return { Editor, templates }
  } catch (error) {
    descriptionEditorLoad = undefined
    throw error
  }
}

type DescriptionEditor = Awaited<ReturnType<typeof importDescriptionEditor>>
let descriptionEditorLoad: Promise<DescriptionEditor> | undefined
const loadDescriptionEditor = () =>
  (descriptionEditorLoad ??= importDescriptionEditor())

export function useDescriptionEditor(
  rootRef: RefObject<HTMLDivElement | null>,
  autoFocus: boolean
) {
  const editorRef = useRef<LexicalEditor | null>(null)
  const [editor, setEditor] = useState<DescriptionEditor | null>(null)
  const [loadState, setLoadState] = useState<"idle" | "loading" | "failed">(
    autoFocus ? "loading" : "idle"
  )
  const editorLoad = useRef<Promise<DescriptionEditor | null> | null>(null)
  const notifyMounted = useRef<
    ((loaded: DescriptionEditor | null) => void) | null
  >(null)
  useEffect(() => {
    if (editorRef.current !== null && editor !== null) {
      notifyMounted.current?.(editor)
      notifyMounted.current = null
    }
  }, [editor])
  const pendingEdit = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      pendingEdit.current?.abort()
      notifyMounted.current?.(null)
      notifyMounted.current = null
    },
    []
  )
  const { editing, startEditing, stopEditing } = useEditMode({
    editorRef,
    rootRef,
    startHotkey: null,
    initial: autoFocus
  })
  const activeEditing = editor !== null && editing

  const mountEditor = useCallback(() => {
    if (editorLoad.current !== null) return editorLoad.current
    if (editor !== null) return Promise.resolve(editor)
    const pending = loadDescriptionEditor()
      .then((loaded) => {
        if (rootRef.current === null) return null
        const mounted = new Promise<DescriptionEditor | null>((resolve) => {
          notifyMounted.current = resolve
        })
        setEditor(loaded)
        setLoadState("idle")
        return mounted
      })
      .catch(() => {
        if (rootRef.current !== null) setLoadState("failed")
        return null
      })
      .finally(() => {
        editorLoad.current = null
      })
    editorLoad.current = pending
    return pending
  }, [editor, rootRef])

  const ensureEditor = () => {
    if (editor === null) setLoadState("loading")
    return mountEditor()
  }

  const edit = () => {
    if (editorRef.current !== null) {
      startEditing()
      return
    }
    if (pendingEdit.current !== null) return
    const selection = readSelection(rootRef.current)
    const request = new AbortController()
    pendingEdit.current = request
    setLoadState("loading")
    const finish = () => {
      request.abort()
      pendingEdit.current = null
    }
    const cancel = () => {
      finish()
      setLoadState("idle")
    }
    const cancelOutside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !(rootRef.current?.contains(event.target) ?? false)
      )
        cancel()
    }
    const options = { signal: request.signal, capture: true }
    document.addEventListener("pointerdown", cancelOutside, options)
    document.addEventListener("focusin", cancelOutside, options)
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") cancel()
      },
      options
    )
    void loadDescriptionEditor().then(
      async () => {
        if (request.signal.aborted || rootRef.current === null) return
        const loaded = await mountEditor()
        if (request.signal.aborted) return
        finish()
        if (loaded === null || rootRef.current === null) return
        const editorRoot = editorRef.current?.getRootElement()
        if (selection !== null && editorRoot)
          selectDescriptionText(editorRoot, selection)
        startEditing()
      },
      () => {
        if (request.signal.aborted || rootRef.current === null) return
        finish()
        setLoadState("failed")
      }
    )
  }

  useHotkey(appHotkeys["tickets.edit-description"], edit, {
    enabled: !activeEditing,
    requireReset: true
  })

  const openForNewTicket = useEffectEvent(() => void mountEditor())
  useEffect(() => {
    if (autoFocus) {
      openForNewTicket()
      return undefined
    }
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        void loadDescriptionEditor().catch(() => {})
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [autoFocus])

  return {
    editor,
    editorRef,
    loadState,
    ensureEditor,
    editing: activeEditing,
    startEditing,
    stopEditing,
    edit
  }
}
