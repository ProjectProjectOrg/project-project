import {
  CodeView,
  WorkerPoolContextProvider,
  type CodeViewHandle,
  type CodeViewItem
} from "@pierre/diffs/react"
import type { CodeViewLineSelection, CodeViewOptions } from "@pierre/diffs"
import { ChevronRight, ExternalLink, FileWarning } from "lucide-react"
import { useCallback, useMemo, useState, type RefObject } from "react"
import {
  buildPierreFileDiff,
  mapPierreSelectionToPendingComment
} from "@/components/Reviews/ReviewFileDiffBlock"
import {
  registerReviewDiffThemes,
  REVIEW_DIFF_THEME,
  REVIEW_DIFF_UNSAFE_CSS,
  useReviewDiffThemeType
} from "@/lib/reviewDiffTheme"
import { m } from "@/paraglide/messages"
import type {
  PendingReviewCommentInput,
  ReviewFilePatch
} from "@projectproject/shared"

type DiffStyle = "unified" | "split"

export function ReviewDiffPane({
  files,
  diffStyle,
  wordWrap,
  viewerRef,
  scrollRef,
  onSelectedRange
}: {
  files: ReadonlyArray<ReviewFilePatch>
  diffStyle: DiffStyle
  wordWrap: boolean
  viewerRef: RefObject<CodeViewHandle<undefined> | null>
  scrollRef: RefObject<HTMLDivElement | null>
  onSelectedRange: (
    range: Omit<PendingReviewCommentInput, "body"> | null
  ) => void
}) {
  const themeType = useReviewDiffThemeType()
  const items = useMemo(
    () =>
      files.flatMap((file): CodeViewItem[] => {
        const fileDiff = buildPierreFileDiff(file)
        return fileDiff
          ? [
              {
                id: file.summary.filename,
                type: "diff",
                fileDiff,
                version: file.patch?.length ?? 0
              }
            ]
          : []
      }),
    [files]
  )
  const codeViewKey = useMemo(
    () =>
      files
        .map(
          (file) =>
            `${file.summary.filename}:${file.patch?.length ?? "missing"}:${file.tooLarge}`
        )
        .join("\u0000"),
    [files]
  )
  const unavailableFiles = files.filter(
    (file) => buildPierreFileDiff(file) === null
  )
  const filesByName = useMemo(
    () => new Map(files.map((file) => [file.summary.filename, file])),
    [files]
  )
  const [selectedLines, setSelectedLines] =
    useState<CodeViewLineSelection | null>(null)

  const handleViewerRef = useCallback(
    (viewer: CodeViewHandle<undefined> | null) => {
      viewerRef.current = viewer
    },
    [viewerRef]
  )

  const updatePendingComment = useCallback(
    (selection: CodeViewLineSelection | null) => {
      onSelectedRange(
        selection
          ? mapPierreSelectionToPendingComment(selection.id, selection.range)
          : null
      )
    },
    [onSelectedRange]
  )

  function updateSelection(selection: CodeViewLineSelection | null) {
    setSelectedLines(selection)
  }

  const toggleFileCollapsed = useCallback(
    (itemId: string) => {
      const viewerHandle = viewerRef.current
      const viewer = viewerHandle?.getInstance()
      const item = viewerHandle?.getItem(itemId)
      if (!viewerHandle || !viewer || !item || item.type !== "diff") return

      const itemTop = viewer.getTopForItem(itemId)
      item.collapsed = item.collapsed !== true
      item.version = typeof item.version === "number" ? item.version + 1 : 1

      if (!viewerHandle.updateItem(item)) return

      if (itemTop != null && itemTop < viewer.getScrollTop()) {
        viewer.scrollTo({ type: "item", id: item.id, align: "start" })
      }
    },
    [viewerRef]
  )

  const options = useMemo(
    () =>
      ({
        theme: REVIEW_DIFF_THEME,
        themeType,
        diffStyle,
        overflow: wordWrap ? "wrap" : "scroll",
        diffIndicators: "bars",
        hunkSeparators: "line-info-basic",
        lineDiffType: "word-alt",
        enableLineSelection: true,
        lineHoverHighlight: "both",
        tokenizeMaxLineLength: 500,
        maxLineDiffLength: 500,
        stickyHeaders: true,
        pointerEventsOnScroll: false,
        layout: { paddingTop: 0, paddingBottom: 0, gap: 16 },
        itemMetrics: {
          diffHeaderHeight: 44,
          paddingTop: 8,
          paddingBottom: 8,
          spacing: 8
        },
        unsafeCSS: REVIEW_DIFF_UNSAFE_CSS,
        onLineSelectionEnd: (range, context) => {
          updatePendingComment(
            range && context.item.type === "diff"
              ? { id: context.item.id, range }
              : null
          )
        }
      }) satisfies CodeViewOptions<undefined>,
    [diffStyle, themeType, updatePendingComment, wordWrap]
  )

  registerReviewDiffThemes()

  return (
    <WorkerPoolContextProvider
      poolOptions={{
        poolSize: 2,
        workerFactory: () =>
          new Worker(
            new URL("@pierre/diffs/worker/worker-portable.js", import.meta.url),
            { type: "module" }
          )
      }}
      highlighterOptions={{
        theme: REVIEW_DIFF_THEME,
        useTokenTransformer: true,
        lineDiffType: "word-alt",
        tokenizeMaxLineLength: 500,
        maxLineDiffLength: 500
      }}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <CodeView
          key={`${themeType}:${codeViewKey}`}
          ref={handleViewerRef}
          containerRef={scrollRef}
          initialItems={items}
          selectedLines={selectedLines}
          onSelectedLinesChange={updateSelection}
          className="relative h-full min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain [contain:strict] [overflow-anchor:none] [font-family:var(--font-mono)] text-[12px] leading-5 [will-change:scroll-position] [&_diffs-container]:overflow-clip [&_diffs-container]:[contain:layout_paint_style]"
          options={options}
          renderCustomHeader={(item) => {
            if (item.type !== "diff") return null
            const file = filesByName.get(item.id)
            if (!file) return null
            const disabled =
              item.fileDiff.splitLineCount === 0 &&
              item.fileDiff.unifiedLineCount === 0
            const collapsed = item.collapsed === true

            return (
              <ReviewFileHeader
                collapsed={collapsed}
                disabled={disabled}
                file={file}
                onToggle={() => toggleFileCollapsed(item.id)}
              />
            )
          }}
        />
        {unavailableFiles.length > 0 && (
          <div className="border-t border-border bg-background px-4 py-3">
            {unavailableFiles.map((file) => (
              <div
                key={file.summary.filename}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <FileWarning
                  className="size-4 shrink-0"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {file.summary.filename}
                </span>
                <span>{m.reviews_file_binary()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </WorkerPoolContextProvider>
  )
}

function ReviewFileHeader({
  collapsed,
  disabled,
  file,
  onToggle
}: {
  collapsed: boolean
  disabled: boolean
  file: ReviewFilePatch
  onToggle: () => void
}) {
  return (
    <div className="flex h-[44px] min-w-0 items-center gap-2 rounded-lg border border-border bg-muted px-3 select-none">
      <button
        type="button"
        disabled={disabled}
        aria-hidden={disabled}
        aria-expanded={!disabled && !collapsed}
        aria-label={
          disabled
            ? undefined
            : collapsed
              ? m.reviews_file_expand()
              : m.reviews_file_collapse()
        }
        className="flex size-6 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onToggle()
        }}
      >
        <ChevronRight
          aria-hidden
          className={
            collapsed
              ? "size-3 shrink-0 transition-transform"
              : "size-3 shrink-0 rotate-90 transition-transform"
          }
          strokeWidth={1.75}
        />
      </button>
      <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
        {file.summary.previousFilename &&
        file.summary.previousFilename !== file.summary.filename ? (
          <>
            <span className="text-muted-foreground line-through">
              {file.summary.previousFilename}
            </span>
            <span className="mx-1 text-muted-foreground">{"->"}</span>
            {file.summary.filename}
          </>
        ) : (
          file.summary.filename
        )}
      </span>
      <span className="ml-auto flex items-center gap-2 font-mono text-xs tabular-nums">
        {file.summary.additions > 0 && (
          <span className="font-medium text-state-success">
            +{file.summary.additions}
          </span>
        )}
        {file.summary.deletions > 0 && (
          <span className="font-medium text-state-danger">
            -{file.summary.deletions}
          </span>
        )}
      </span>
      <a
        href={file.htmlUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={m.reviews_file_open_github()}
        className="flex size-6 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        onClick={(event) => event.stopPropagation()}
      >
        <ExternalLink className="size-3.5" strokeWidth={1.75} />
      </a>
    </div>
  )
}
