import { useEffect, useRef } from "react"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS
} from "@lexical/markdown"
import {
  CodeHighlightNode,
  CodeNode,
  registerCodeHighlighting
} from "@lexical/code"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import { ListItemNode, ListNode } from "@lexical/list"
import { LinkNode } from "@lexical/link"
import "@/lib/prism-langs"
import { cn } from "@/lib/utils"

// Lexical-backed markdown editor.
//
// Spec: read markdown on mount → Lexical state, edit in rich-text mode,
// serialize → markdown on change, debounce-save through the parent.
//
// Code highlighting comes from `@lexical/code` (Prism under the hood). The
// theme below maps Lexical's `codeHighlight.<token>` keys to the same
// `.token.<name>` class names that `rehype-prism-plus` emits in the read
// view — so the styles in styles.css cover both.

// Lexical's theme is just a flat dictionary of node-type → CSS class. It's
// applied at render time. We use the same .token classes the read renderer
// uses so a single CSS palette covers both ends.
const lexicalTheme = {
  paragraph: "lexical-paragraph",
  heading: {
    h1: "lexical-h1",
    h2: "lexical-h2",
    h3: "lexical-h3",
    h4: "lexical-h4",
    h5: "lexical-h5",
    h6: "lexical-h6"
  },
  quote: "lexical-quote",
  list: {
    ul: "lexical-ul",
    ol: "lexical-ol",
    listitem: "lexical-li"
  },
  link: "lexical-link",
  text: {
    bold: "lexical-bold",
    italic: "lexical-italic",
    code: "lexical-inline-code",
    strikethrough: "lexical-strike",
    underline: "lexical-underline"
  },
  code: "lexical-code",
  codeHighlight: {
    atrule: "token atrule",
    attr: "token attr-name",
    boolean: "token boolean",
    builtin: "token builtin",
    cdata: "token cdata",
    char: "token char",
    "class-name": "token class-name",
    comment: "token comment",
    constant: "token constant",
    deleted: "token deleted",
    doctype: "token doctype",
    entity: "token entity",
    function: "token function",
    important: "token important",
    inserted: "token inserted",
    keyword: "token keyword",
    namespace: "token namespace",
    number: "token number",
    operator: "token operator",
    prolog: "token prolog",
    property: "token property",
    punctuation: "token punctuation",
    regex: "token regex",
    selector: "token selector",
    string: "token string",
    symbol: "token symbol",
    tag: "token tag",
    url: "token url",
    variable: "token variable",
    // Diff-specific token types emitted by @lexical/code-prism's inline diff
    // grammar. Without these the +/- lines stay uncolored.
    "deleted-sign": "token deleted-sign",
    "deleted-arrow": "token deleted-arrow",
    "inserted-sign": "token inserted-sign",
    "inserted-arrow": "token inserted-arrow",
    unchanged: "token unchanged",
    diff: "token diff",
    coord: "token coord",
    line: "token line",
    prefix: "token prefix"
  }
}

// Plugin: registers Lexical's Prism-based code highlighter on mount. It's
// shipped as a function call rather than a JSX plugin component, so we wrap
// it ourselves.
function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => registerCodeHighlighting(editor), [editor])
  return null
}

// We deliberately do NOT have an external-sync plugin. Once the editor
// mounts, it owns the markdown until unmount — the autosave round-trip
// (parent re-renders with the same body we typed) would otherwise re-apply
// state and reset the cursor. To swap to a different project's body, the
// caller must remount this component (e.g. `<LexicalEditor key={slug} />`).

export type SaveStatus = "idle" | "dirty" | "saving" | "saved"

export interface LexicalEditorProps {
  /** Initial markdown body. Re-applied to the editor when this prop changes. */
  markdown: string
  /** Called with the serialized markdown on every change, debounced internally. */
  onChange: (markdown: string) => Promise<void> | void
  /** Optional save-status sink so the parent can show "saving…"/"saved". */
  onStatusChange?: (status: SaveStatus) => void
  /** Debounce delay for autosave in milliseconds. */
  debounceMs?: number
  className?: string
  placeholder?: string
}

export function LexicalEditor({
  markdown,
  onChange,
  onStatusChange,
  debounceMs = 600,
  className,
  placeholder = "Write a description in markdown…"
}: LexicalEditorProps) {
  const initialConfig = useRef({
    namespace: "ProjectBody",
    theme: lexicalTheme,
    onError: (error: Error) => {
      console.error("[Lexical]", error)
    },
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      CodeNode,
      CodeHighlightNode,
      LinkNode
    ],
    editorState: () => {
      $convertFromMarkdownString(markdown, TRANSFORMERS)
    }
  }).current

  // The editor's current serialized markdown — updated on every change. Used
  // to suppress no-op fires of OnChangePlugin.
  const liveRef = useRef(markdown)
  // OnChangePlugin fires once on mount with whatever Lexical re-serializes
  // the initial state to — which can drift from the source markdown by a
  // trailing newline or two. We treat that first call as the new baseline
  // rather than as a user edit, so we don't autosave on page open.
  const isFirstChange = useRef(true)

  // Debounced save. Lexical fires onChange synchronously per keystroke; we
  // hold the latest serialized markdown and flush it on the trailing edge.
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef(false)

  function setStatus(s: SaveStatus) {
    onStatusChange?.(s)
  }

  function flush() {
    if (inflight.current) return
    const next = pending.current
    if (next === null) return
    pending.current = null
    inflight.current = true
    setStatus("saving")
    Promise.resolve(onChange(next))
      .then(() => setStatus("saved"))
      .catch((err) => {
        console.error("[LexicalEditor] save failed", err)
        setStatus("dirty")
      })
      .finally(() => {
        inflight.current = false
        // If more input came in while saving, schedule another flush.
        if (pending.current !== null) schedule()
      })
  }

  function schedule() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, debounceMs)
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  return (
    <div className={cn("prose-md", className)}>
      <LexicalComposer initialConfig={initialConfig}>
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="lexical-content min-h-[8rem] outline-none"
                aria-placeholder={placeholder}
                placeholder={
                  <div className="pointer-events-none absolute left-0 top-0 select-none text-muted-foreground">
                    {placeholder}
                  </div>
                }
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin />
        <CodeHighlightPlugin />
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
        <OnChangePlugin
          onChange={(editorState) => {
            editorState.read(() => {
              const next = $convertToMarkdownString(TRANSFORMERS)
              if (isFirstChange.current) {
                isFirstChange.current = false
                liveRef.current = next
                return
              }
              if (next === liveRef.current) return
              liveRef.current = next
              pending.current = next
              setStatus("dirty")
              schedule()
            })
          }}
          ignoreSelectionChange
        />
      </LexicalComposer>
    </div>
  )
}
