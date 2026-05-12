import { useEffect, useRef, useState } from "react"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import {
  configExtension,
  defineExtension,
  $createParagraphNode,
  $getRoot,
  type ElementNode,
  type LexicalEditor as LexicalEditorType
} from "lexical"
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  CHECK_LIST,
  TRANSFORMERS
} from "@lexical/markdown"
import { RichTextExtension } from "@lexical/rich-text"
import { HistoryExtension } from "@lexical/history"
import {
  CheckListExtension,
  ListExtension,
  $isListItemNode
} from "@lexical/list"
import { LinkExtension } from "@lexical/link"
import { CodeExtension, registerCodeHighlighting } from "@lexical/code"
import {
  AutoFocusExtension,
  HorizontalRuleExtension,
  TabIndentationExtension
} from "@lexical/extension"
import { MentionExtension } from "./Lexical/MentionExtension"
import { MentionsPlugin } from "./Lexical/MentionsPlugin"
import { MENTION_TRANSFORMER } from "./Lexical/mentionTransformer"
import { HORIZONTAL_RULE } from "./Lexical/horizontalRuleTransformer"
import { ChecklistClickExtension } from "./Lexical/checklistClickExtension"
import { ListTabExtension } from "./Lexical/listTabExtension"
import "@/lib/prism-langs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const MARKDOWN_TRANSFORMERS = [
  MENTION_TRANSFORMER,
  CHECK_LIST,
  HORIZONTAL_RULE,
  ...TRANSFORMERS
]

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
    listitem: "lexical-li",
    checklist: "lexical-checklist",
    listitemChecked: "lexical-li-checked",
    listitemUnchecked: "lexical-li-unchecked",
    nested: {
      listitem: "lexical-li-nested"
    }
  },
  hr: "lexical-hr",
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

const CodeHighlightExtension = defineExtension({
  name: "@projectproject/code-highlight",
  dependencies: [CodeExtension],
  register: (editor: LexicalEditorType) => registerCodeHighlighting(editor)
})

const $canIndentInsideLists = (node: ElementNode) => $isListItemNode(node)

export type SaveStatus = "idle" | "dirty" | "saving" | "saved"

export interface LexicalEditorProps {
  markdown: string
  onChange: (markdown: string) => Promise<void> | void
  onStatusChange?: (status: SaveStatus) => void
  debounceMs?: number
  className?: string
  placeholder?: string
  autoFocus?: boolean
  compact?: boolean
}

export function LexicalEditor({
  markdown,
  onChange,
  onStatusChange,
  debounceMs = 600,
  className,
  placeholder = m.editor_placeholder(),
  autoFocus = false,
  compact = false
}: LexicalEditorProps) {
  const [extension] = useState(() => {
    const initialMarkdown = markdown
    const initialAutoFocus = autoFocus
    return defineExtension({
      name: "@projectproject/body-editor",
      namespace: "ProjectBody",
      theme: lexicalTheme,
      onError: (error) => {
        Effect.runFork(Effect.logError("[Lexical]", error))
      },
      $initialEditorState: () => {
        $convertFromMarkdownString(initialMarkdown, MARKDOWN_TRANSFORMERS)
        const root = $getRoot()
        const last = root.getLastChild()
        if (!last || last.getType() !== "paragraph") {
          root.append($createParagraphNode())
        }
      },
      dependencies: [
        RichTextExtension,
        HistoryExtension,
        ListExtension,
        CheckListExtension,
        ChecklistClickExtension,
        ListTabExtension,
        LinkExtension,
        CodeExtension,
        CodeHighlightExtension,
        HorizontalRuleExtension,
        MentionExtension,
        configExtension(TabIndentationExtension, {
          $canIndent: $canIndentInsideLists,
          maxIndent: 4
        }),
        configExtension(AutoFocusExtension, {
          defaultSelection: "rootEnd",
          disabled: !initialAutoFocus
        })
      ]
    })
  })

  const liveRef = useRef(markdown)
  const isFirstChange = useRef(true)
  const pending = useRef<string | null>(null)
  const timer = useRef<Fiber.RuntimeFiber<void> | null>(null)
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
        Effect.runFork(Effect.logError("[LexicalEditor] save failed", err))
        setStatus("dirty")
      })
      .finally(() => {
        inflight.current = false
        if (pending.current !== null) schedule()
      })
  }

  function schedule() {
    if (timer.current) Effect.runFork(Fiber.interrupt(timer.current))
    timer.current = Effect.runFork(
      Effect.sleep(debounceMs).pipe(Effect.tap(() => Effect.sync(flush)))
    )
  }

  useEffect(
    () => () => {
      if (timer.current) Effect.runFork(Fiber.interrupt(timer.current))
    },
    []
  )

  const [contentEditable] = useState(() => (
    <div className="relative">
      <ContentEditable
        className={cn(
          "lexical-content outline-none",
          compact ? "min-h-[1.5rem]" : "min-h-[8rem]"
        )}
        aria-placeholder={placeholder}
        placeholder={
          <div className="pointer-events-none absolute left-0 top-0 select-none text-muted-foreground">
            {placeholder}
          </div>
        }
      />
    </div>
  ))

  return (
    <div className={cn("prose-md", className)}>
      <LexicalExtensionComposer
        extension={extension}
        contentEditable={contentEditable}
      >
        <MentionsPlugin />
        <MarkdownShortcutPlugin transformers={MARKDOWN_TRANSFORMERS} />
        <OnChangePlugin
          onChange={(editorState) => {
            editorState.read(() => {
              const next = $convertToMarkdownString(MARKDOWN_TRANSFORMERS)
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
      </LexicalExtensionComposer>
    </div>
  )
}
