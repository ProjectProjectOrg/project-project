import {
  CodeView,
  WorkerPoolContextProvider,
  type CodeViewHandle,
  type CodeViewItem
} from "@pierre/diffs/react"
import type { CodeViewLineSelection, CodeViewOptions } from "@pierre/diffs"
import { ExternalLink, FileWarning } from "lucide-react"
import { useCallback, useMemo, useState, type RefObject } from "react"
import {
  buildPierreFileDiff,
  mapPierreSelectionToPendingComment
} from "@/components/Reviews/ReviewFileDiffBlock"
import { m } from "@/paraglide/messages"
import type {
  PendingReviewCommentInput,
  ReviewFilePatch
} from "@projectproject/shared"

type DiffStyle = "unified" | "split"

export function ReviewDiffPane({
  files,
  diffStyle,
  viewerRef,
  scrollRef,
  onSelectedRange
}: {
  files: ReadonlyArray<ReviewFilePatch>
  diffStyle: DiffStyle
  viewerRef: RefObject<CodeViewHandle<undefined> | null>
  scrollRef: RefObject<HTMLDivElement | null>
  onSelectedRange: (
    range: Omit<PendingReviewCommentInput, "body"> | null
  ) => void
}) {
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

  const options = useMemo(
    () =>
      ({
        theme: {
          light: "pierre-light",
          dark: "pierre-dark"
        },
        themeType: "system",
        diffStyle,
        overflow: "scroll",
        diffIndicators: "bars",
        hunkSeparators: "line-info-basic",
        lineDiffType: "word-alt",
        enableLineSelection: true,
        lineHoverHighlight: "both",
        tokenizeMaxLineLength: 500,
        maxLineDiffLength: 500,
        stickyHeaders: true,
        pointerEventsOnScroll: false,
        layout: { paddingTop: 0, paddingBottom: 0, gap: 1 },
        onLineSelectionEnd: (range, context) => {
          updatePendingComment(
            range && context.item.type === "diff"
              ? { id: context.item.id, range }
              : null
          )
        }
      }) satisfies CodeViewOptions<undefined>,
    [diffStyle, updatePendingComment]
  )

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
        theme: { light: "pierre-light", dark: "pierre-dark" },
        useTokenTransformer: true,
        lineDiffType: "word-alt",
        tokenizeMaxLineLength: 500,
        maxLineDiffLength: 500
      }}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <CodeView
          key={codeViewKey}
          ref={handleViewerRef}
          containerRef={scrollRef}
          initialItems={items}
          selectedLines={selectedLines}
          onSelectedLinesChange={updateSelection}
          className="relative h-full min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain [contain:strict] [overflow-anchor:none] [font-family:var(--font-mono)] text-[12px] leading-5 [will-change:scroll-position] [&_diffs-container]:overflow-clip [&_diffs-container]:[contain:layout_paint_style]"
          options={options}
          renderHeaderMetadata={(item) => {
            const file = files.find(
              (entry) => entry.summary.filename === item.id
            )
            if (!file) return null
            return (
              <span className="inline-flex items-center gap-3 font-mono text-xs">
                <a
                  href={file.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={m.reviews_file_open_github()}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ExternalLink className="size-3.5" strokeWidth={1.75} />
                </a>
                <span className="text-state-success">
                  +{file.summary.additions}
                </span>
                <span className="text-state-danger">
                  -{file.summary.deletions}
                </span>
              </span>
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
