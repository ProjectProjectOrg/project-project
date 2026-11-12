import { CodeExtension, registerCodeHighlighting } from "@lexical/code"
import { AutoFocusExtension, HorizontalRuleExtension } from "@lexical/extension"
import { HistoryExtension } from "@lexical/history"
import {
  AutoLinkExtension,
  ClickableLinkExtension,
  LinkExtension,
  createLinkMatcherWithRegExp,
  formatUrl
} from "@lexical/link"
import { CheckListExtension, ListExtension } from "@lexical/list"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  INLINE_CODE,
  TRANSFORMERS
} from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin"
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { RichTextExtension } from "@lexical/rich-text"
import { TableExtension } from "@lexical/table"
import { EMPTY_LAYER, resolveLibrary, type TicketId } from "@pp/shared"
import { useDebouncer } from "@tanstack/react-pacer"
import * as Effect from "effect/Effect"
import {
  configExtension,
  defineExtension,
  $createParagraphNode,
  $getRoot,
  type LexicalEditor as LexicalEditorType
} from "lexical"
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from "react"

import { figmaTicketLinksRequest } from "@/features/figma/atoms/figma"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { AttachmentExtension } from "../lexical/AttachmentExtension"
import { AttachmentsPlugin } from "../lexical/AttachmentsPlugin"
import { ATTACHMENT_TRANSFORMER } from "../lexical/attachmentTransformer"
import { HintExtension } from "../lexical/blocks/definitionMode"
import {
  hasBlockGutter,
  type EditorBlocks,
  type EditorBlocksMode
} from "../lexical/blocks/editorBlocks"
import { EditorBlocksProvider } from "../lexical/blocks/editorBlocksContext"
import { HINT_TRANSFORMER } from "../lexical/blocks/HintNode"
import { SlashMenuPlugin } from "../lexical/blocks/SlashMenuPlugin"
import { SyncedBlockExtension } from "../lexical/blocks/SyncedBlockNode"
import { TicketBlocksPlugins } from "../lexical/blocks/TicketBlocksPlugins"
import { ChecklistClickExtension } from "../lexical/checklistClickExtension"
import {
  ChecklistShortcutExtension,
  ESCAPED_CHECK_LIST
} from "../lexical/checklistMarkdown"
import {
  INLINE_MARKDOWN_TRANSFORMER,
  commonMarkTransformers
} from "../lexical/commonMarkTransformer"
import { FigmaExtension } from "../lexical/FigmaExtension"
import { FigmaPlugin } from "../lexical/FigmaPlugin"
import { FIGMA_TRANSFORMER } from "../lexical/figmaTransformer"
import { FormattingToolbarPlugin } from "../lexical/FormattingToolbarPlugin"
import {
  HORIZONTAL_RULE,
  HorizontalRuleEnterExtension
} from "../lexical/horizontalRuleTransformer"
import { ImageNode } from "../lexical/ImageNode"
import { LinePlaceholderPlugin } from "../lexical/LinePlaceholderPlugin"
import { LinkFaviconsPlugin } from "../lexical/LinkFaviconsPlugin"
import { ListTabExtension } from "../lexical/listTabExtension"
import { registerMarkdownPaste } from "../lexical/markdownPaste"
import { MentionExtension } from "../lexical/MentionExtension"
import { MentionsPlugin } from "../lexical/MentionsPlugin"
import { MENTION_TRANSFORMER } from "../lexical/mentionTransformer"
import { PaperExtension } from "../lexical/PaperExtension"
import { PaperPlugin } from "../lexical/PaperPlugin"
import { PAPER_TRANSFORMER } from "../lexical/paperTransformer"
import "@/lib/prismLangs"

import { SubmitOnEnterPlugin } from "../lexical/SubmitOnEnterPlugin"
import { TABLE_TRANSFORMER } from "../lexical/tableTransformer"
import { TicketBlockExtension } from "../lexical/TicketBlockExtension"
import { createTicketBlockTransformer } from "../lexical/ticketBlockTransformer"
import type { MarkdownSize } from "./Markdown"

const INLINE_AND_BLOCK_TRANSFORMERS = [
  INLINE_MARKDOWN_TRANSFORMER,
  MENTION_TRANSFORMER,
  ESCAPED_CHECK_LIST,
  HORIZONTAL_RULE,
  PAPER_TRANSFORMER,
  FIGMA_TRANSFORMER,
  ...TRANSFORMERS.filter((transformer) => transformer !== INLINE_CODE)
]

function createMarkdownTransformers(
  inline: ReadonlyArray<(typeof INLINE_AND_BLOCK_TRANSFORMERS)[number]>,
  mode: EditorBlocksMode | undefined
) {
  const content = [TABLE_TRANSFORMER, ...inline]
  const transformers =
    mode === "definition"
      ? [HINT_TRANSFORMER, ...content]
      : [
          createTicketBlockTransformer(commonMarkTransformers(content), {
            emptyAsReference: mode === "template"
          }),
          ...content
        ]
  return commonMarkTransformers(transformers)
}

export const MARKDOWN_TRANSFORMERS = createMarkdownTransformers(
  INLINE_AND_BLOCK_TRANSFORMERS,
  undefined
)

const ATTACHMENT_MARKDOWN_TRANSFORMERS = createMarkdownTransformers(
  [ATTACHMENT_TRANSFORMER, ...INLINE_AND_BLOCK_TRANSFORMERS],
  undefined
)

const TEMPLATE_MARKDOWN_TRANSFORMERS = createMarkdownTransformers(
  INLINE_AND_BLOCK_TRANSFORMERS,
  "template"
)

const DEFINITION_MARKDOWN_TRANSFORMERS = createMarkdownTransformers(
  INLINE_AND_BLOCK_TRANSFORMERS,
  "definition"
)

export const transformersForMode = (
  mode: EditorBlocksMode | undefined,
  attachments: AttachmentsTarget | undefined
) => {
  if (mode === "template") return TEMPLATE_MARKDOWN_TRANSFORMERS
  if (mode === "definition") return DEFINITION_MARKDOWN_TRANSFORMERS
  return transformersForAttachments(attachments)
}

export const transformersForAttachments = (
  attachments: AttachmentsTarget | undefined
) =>
  attachments === undefined
    ? MARKDOWN_TRANSFORMERS
    : ATTACHMENT_MARKDOWN_TRANSFORMERS

export const attachmentsForDescription = (input: {
  readonly orgSlug: string
  readonly slug: string
  readonly ticketId: TicketId
  readonly storageActive: boolean
}): AttachmentsTarget => ({
  orgSlug: input.orgSlug,
  slug: input.slug,
  ticketId: input.ticketId,
  uploadsEnabled: input.storageActive
})

const URL_MATCHER = createLinkMatcherWithRegExp(
  /(?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?]/i,
  formatUrl
)

const EMAIL_MATCHER = createLinkMatcherWithRegExp(
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  formatUrl
)

export const AUTO_LINK_MATCHERS = [URL_MATCHER, EMAIL_MATCHER]

const lexicalTheme = {
  tableScrollableWrapper: "lexical-table-scroll",
  tableCellSelected: "lexical-table-cell-selected",
  tableSelection: "lexical-table-selection",
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
  name: "@pp/code-highlight",
  dependencies: [CodeExtension],
  register: (editor: LexicalEditorType) => registerCodeHighlighting(editor)
})

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "failed"

export interface AttachmentsTarget {
  readonly orgSlug: string
  readonly slug: string
  readonly ticketId: TicketId
  readonly uploadsEnabled: boolean
}

const NO_LIBRARY = resolveLibrary(
  { org: EMPTY_LAYER, project: null },
  false,
  EMPTY_LAYER
)

export interface LexicalEditorProps {
  markdown: string
  onChange?: (markdown: string) => Promise<void> | void
  onDraftChange?: (markdown: string) => void
  onSubmit?: () => void
  onStatusChange?: (status: SaveStatus) => void
  debounceMs?: number
  className?: string
  placeholder?: string
  autoFocus?: boolean | "start"
  compact?: boolean
  size?: MarkdownSize
  attachments?: AttachmentsTarget
  blocks?: EditorBlocks
  editorRef?: RefObject<LexicalEditorType | null>
  editable?: boolean
}

export function nextMarkdownChange(
  currentMarkdown: string,
  nextMarkdown: string
) {
  if (nextMarkdown === currentMarkdown) return null
  return nextMarkdown
}

export function createCoalescedSaveQueue<A>(options: {
  readonly save: (value: A) => Promise<void> | void
  readonly schedule: () => void
  readonly onStatus: (status: SaveStatus) => void
  readonly onError: (error: unknown) => void
}) {
  let pending: A | null = null
  let inflight = false
  let unmounted = false

  const flush = (notify = true): Promise<void> | undefined => {
    if (inflight || pending === null) return undefined
    const next = pending
    pending = null
    inflight = true
    if (notify) options.onStatus("saving")
    let retainedFailure = false
    let saving: Promise<void>
    try {
      saving = Promise.resolve(options.save(next))
    } catch (error) {
      saving = Promise.reject(error)
    }
    saving = saving
      .then(() => {
        if (notify && pending === null) options.onStatus("saved")
      })
      .catch((error: unknown) => {
        if (pending === null) {
          pending = next
          retainedFailure = true
        }
        options.onError(error)
        if (notify) options.onStatus("failed")
      })
      .finally(() => {
        inflight = false
        if (pending !== null && !retainedFailure) {
          if (unmounted) void flush(false)
          else options.schedule()
        }
      })
    return saving
  }

  return {
    enqueue: (value: A) => {
      pending = value
    },
    flush,
    unmount: () => {
      unmounted = true
      void flush(false)
    }
  }
}

function LinkBlurActivationPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(
    () =>
      editor.registerRootListener((root) => {
        if (!root) return
        const handlePointerDown = (event: PointerEvent) => {
          if (event.button > 1) return
          if (!(event.target instanceof Element)) return
          const link = event.target.closest("a.lexical-link")
          if (!link || !root.contains(link)) return
          if (root.contains(document.activeElement)) return
          event.preventDefault()
        }
        root.addEventListener("pointerdown", handlePointerDown)
        return () => {
          root.removeEventListener("pointerdown", handlePointerDown)
        }
      }),
    [editor]
  )

  return null
}

function EditablePlugin({ editable }: Readonly<{ editable: boolean }>) {
  const [editor] = useLexicalComposerContext()

  useLayoutEffect(() => {
    editor.setEditable(editable)
  }, [editor, editable])

  return null
}

export function LexicalEditor({
  markdown,
  onChange,
  onDraftChange,
  onSubmit,
  onStatusChange,
  debounceMs = 600,
  className,
  placeholder = m.editor_placeholder(),
  autoFocus = false,
  compact = false,
  size = "default",
  attachments,
  blocks,
  editorRef,
  editable = true
}: LexicalEditorProps) {
  const [transformers] = useState(() =>
    transformersForMode(blocks?.mode, attachments)
  )
  const [hintNodesEnabled] = useState(() => blocks?.mode === "definition")
  const [attachmentNodesEnabled] = useState(() => attachments !== undefined)
  const [extension] = useState(() => {
    const initialMarkdown = markdown
    const initialAutoFocus = autoFocus
    return defineExtension({
      name: "@pp/body-editor",
      namespace: "ProjectBody",
      theme: lexicalTheme,
      nodes: [ImageNode],
      register: (editor: LexicalEditorType) =>
        registerMarkdownPaste(editor, transformers),
      onError: (error) => {
        Effect.runFork(Effect.logError("[Lexical]", error))
      },
      $initialEditorState: () => {
        $convertFromMarkdownString(initialMarkdown, transformers)
        const root = $getRoot()
        const last = root.getLastChild()
        if (!last || last.getType() !== "paragraph") {
          root.append($createParagraphNode())
        }
      },
      dependencies: [
        RichTextExtension,
        configExtension(TableExtension, {
          hasCellMerge: false,
          hasCellBackgroundColor: false,
          hasHorizontalScroll: true
        }),
        HistoryExtension,
        ListExtension,
        CheckListExtension,
        ChecklistClickExtension,
        ChecklistShortcutExtension,
        ListTabExtension,
        LinkExtension,
        configExtension(ClickableLinkExtension, {
          newTab: true,
          disabled: false
        }),
        configExtension(AutoLinkExtension, {
          matchers: AUTO_LINK_MATCHERS
        }),
        CodeExtension,
        CodeHighlightExtension,
        HorizontalRuleExtension,
        HorizontalRuleEnterExtension,
        MentionExtension,
        FigmaExtension,
        PaperExtension,
        TicketBlockExtension,
        SyncedBlockExtension,
        ...(attachmentNodesEnabled ? [AttachmentExtension] : []),
        ...(hintNodesEnabled ? [HintExtension] : []),
        configExtension(AutoFocusExtension, {
          defaultSelection:
            initialAutoFocus === "start" ? "rootStart" : "rootEnd",
          disabled: initialAutoFocus === false
        })
      ]
    })
  })

  const liveRef = useRef(markdown)
  const onChangeRef = useRef(onChange)
  const onStatusChangeRef = useRef(onStatusChange)
  const scheduleRef = useRef<() => void>(() => {})
  onChangeRef.current = onChange
  onStatusChangeRef.current = onStatusChange

  function setStatus(s: SaveStatus) {
    onStatusChangeRef.current?.(s)
  }

  const saveQueueRef = useRef<ReturnType<
    typeof createCoalescedSaveQueue<string>
  > | null>(null)
  if (saveQueueRef.current === null) {
    saveQueueRef.current = createCoalescedSaveQueue({
      save: (next) => onChangeRef.current?.(next),
      schedule: () => scheduleRef.current(),
      onStatus: setStatus,
      onError: (error) => {
        Effect.runFork(Effect.logError("[LexicalEditor] save failed", error))
      }
    })
  }
  const saveQueue = saveQueueRef.current

  const saveDebouncer = useDebouncer(() => saveQueue.flush(), {
    wait: debounceMs,
    onUnmount: (d) => {
      d.cancel()
      saveQueue.unmount()
    }
  })
  scheduleRef.current = () => saveDebouncer.maybeExecute()

  const wrapperRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const content = wrapper.querySelector<HTMLElement>(".lexical-content")
    if (!content) return
    content.spellcheck = false
    const focusIn = () => {
      content.spellcheck = true
    }
    const focusOut = () => {
      content.spellcheck = false
    }
    wrapper.addEventListener("focusin", focusIn)
    wrapper.addEventListener("focusout", focusOut)
    return () => {
      wrapper.removeEventListener("focusin", focusIn)
      wrapper.removeEventListener("focusout", focusOut)
    }
  }, [])

  const submitHint = useId()
  const [contentEditable] = useState(() => (
    <div className="relative">
      <ContentEditable
        className={cn(
          "lexical-content outline-none",
          compact ? "min-h-[1.5rem]" : "min-h-[8rem]"
        )}
        aria-label={placeholder}
        aria-describedby={onSubmit === undefined ? undefined : submitHint}
        aria-placeholder={placeholder}
        placeholder={
          <div className="pointer-events-none absolute top-0 left-0 text-muted-foreground select-none">
            {placeholder}
          </div>
        }
      />
    </div>
  ))

  const figmaOrgSlug = attachments?.orgSlug
  const figmaProjectSlug = attachments?.slug
  const figmaTicketId = attachments?.ticketId
  const figmaTarget = useMemo(
    () =>
      figmaOrgSlug === undefined ||
      figmaProjectSlug === undefined ||
      figmaTicketId === undefined
        ? null
        : figmaTicketLinksRequest(
            figmaOrgSlug,
            figmaProjectSlug,
            figmaTicketId
          ),
    [figmaOrgSlug, figmaProjectSlug, figmaTicketId]
  )

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "group/editing prose-md",
        size === "compact" && "prose-compact",
        hasBlockGutter(blocks) && "block-gutter",
        className
      )}
    >
      <EditorBlocksProvider blocks={blocks} transformers={transformers}>
        <LexicalExtensionComposer
          extension={extension}
          contentEditable={contentEditable}
        >
          {editorRef !== undefined ? (
            <EditorRefPlugin editorRef={editorRef} />
          ) : null}
          <MentionsPlugin />
          <FigmaPlugin request={figmaTarget} />
          <PaperPlugin />
          {attachments !== undefined && attachments.uploadsEnabled ? (
            <AttachmentsPlugin
              orgSlug={attachments.orgSlug}
              slug={attachments.slug}
              ticketId={attachments.ticketId}
            />
          ) : null}
          {onSubmit !== undefined ? (
            <>
              <SubmitOnEnterPlugin onSubmit={onSubmit} />
              <span id={submitHint} className="sr-only">
                {m.editor_submit_hint()}
              </span>
            </>
          ) : null}
          <EditablePlugin editable={editable} />
          {editable && <FormattingToolbarPlugin />}
          <LinkBlurActivationPlugin />
          <LinkFaviconsPlugin />
          {compact ? null : <LinePlaceholderPlugin />}
          {blocks !== undefined ? (
            <TicketBlocksPlugins blocks={blocks} transformers={transformers} />
          ) : (
            <SlashMenuPlugin
              library={NO_LIBRARY}
              ticketType={null}
              transformers={transformers}
              mode="basic"
            />
          )}
          <MarkdownShortcutPlugin transformers={transformers} />
          <OnChangePlugin
            onChange={(editorState) => {
              editorState.read(() => {
                const next = $convertToMarkdownString(transformers)
                const changed = nextMarkdownChange(liveRef.current, next)
                if (changed === null) return
                liveRef.current = changed
                onDraftChange?.(next)
                saveQueue.enqueue(changed)
                setStatus("dirty")
                scheduleRef.current()
              })
            }}
            ignoreSelectionChange
          />
        </LexicalExtensionComposer>
      </EditorBlocksProvider>
    </div>
  )
}
