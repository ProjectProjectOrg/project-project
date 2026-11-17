import { CodeExtension } from "@lexical/code"
import { AutoFocusExtension, HorizontalRuleExtension } from "@lexical/extension"
import { HistoryExtension } from "@lexical/history"
import {
  AutoLinkExtension,
  ClickableLinkExtension,
  LinkExtension
} from "@lexical/link"
import { CheckListExtension, ListExtension } from "@lexical/list"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString
} from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin"
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { RichTextExtension } from "@lexical/rich-text"
import { TableExtension } from "@lexical/table"
import { EMPTY_LAYER, resolveLibrary } from "@pp/shared"
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

import { ChecklistClickExtension } from "../editor/checklist-click-extension"
import { ChecklistShortcutExtension } from "../editor/checklist-markdown"
import { FormattingToolbarPlugin } from "../editor/formatting-toolbar"
import { HorizontalRuleEnterExtension } from "../editor/horizontal-rule"
import { ImageNode } from "../editor/image-node"
import { LinePlaceholderPlugin } from "../editor/line-placeholder-plugin"
import { ListTabExtension } from "../editor/list-tab-extension"
import { registerMarkdownPaste } from "../editor/markdown-paste"
import { SubmitShortcutPlugin } from "../editor/submit-shortcut-plugin"
import { CodeHighlightExtension, editorTheme } from "../editor/theme"
import { cn } from "../lib/utils"
import { AttachmentExtension } from "./attachments/attachment-extension"
import { AttachmentsPlugin } from "./attachments/attachments-plugin"
import { HintExtension } from "./blocks/definition-mode"
import { hasBlockGutter, type EditorBlocks } from "./blocks/editor-blocks"
import { EditorBlocksProvider } from "./blocks/editor-blocks-context"
import { SyncedBlockExtension } from "./blocks/synced-block-node"
import { TicketBlockExtension } from "./blocks/ticket-block-extension"
import { TicketBlocksPlugins } from "./blocks/ticket-blocks-plugins"
import { CodeLanguagePlugin } from "./code-language-plugin"
import {
  AUTO_LINK_MATCHERS,
  transformersForMode,
  type AttachmentsTarget
} from "./editor-transformers"
import { FigmaExtension } from "./figma/figma-extension"
import { FigmaPlugin } from "./figma/figma-plugin"
import { formattingToolbarLabels } from "./formatting-toolbar-labels"
import { LinkFaviconsPlugin } from "./links/link-favicons-plugin"
import type { MarkdownSize } from "./markdown"
import { MentionExtension } from "./mentions/mention-extension"
import { MentionsPlugin } from "./mentions/mentions-plugin"
import { m } from "./messages"
import { PaperExtension } from "./paper/paper-extension"
import { PaperPlugin } from "./paper/paper-plugin"
import {
  createCoalescedSaveQueue,
  nextMarkdownChange,
  type SaveStatus
} from "./save-queue"
import { SlashMenuPlugin } from "./slash-menu/slash-menu-plugin"

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
      theme: editorTheme,
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
          <div
            data-slot="editor-placeholder"
            className="pointer-events-none absolute top-0 left-0 text-muted-foreground select-none"
          >
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
        : {
            orgSlug: figmaOrgSlug,
            slug: figmaProjectSlug,
            ticketId: figmaTicketId
          },
    [figmaOrgSlug, figmaProjectSlug, figmaTicketId]
  )

  return (
    <div
      ref={wrapperRef}
      // With sections, their icon and handle sit inside each section, at
      // the start of its first line, not in the margin: nothing sticks out
      // of a hovered section.
      data-block-rail-inset={hasBlockGutter(blocks) ? "" : undefined}
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
              <SubmitShortcutPlugin onSubmit={onSubmit} />
              <span id={submitHint} className="sr-only">
                {m.editor_submit_hint()}
              </span>
            </>
          ) : null}
          <EditablePlugin editable={editable} />
          {editable && (
            <FormattingToolbarPlugin labels={formattingToolbarLabels()} />
          )}
          <LinkBlurActivationPlugin />
          <CodeLanguagePlugin />
          <LinkFaviconsPlugin />
          {compact ? null : (
            <LinePlaceholderPlugin placeholder={m.editor_line_placeholder()} />
          )}
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
