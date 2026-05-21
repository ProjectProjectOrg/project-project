import { FileDiff } from "@pierre/diffs/react"
import {
  ExternalLink,
  FileWarning,
  Minus,
  Plus,
  SquareChevronDown,
  SquareChevronRight
} from "lucide-react"
import { useMemo, useState } from "react"
import { parsePatchFiles } from "@pierre/diffs"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"
import type { SelectedLineRange } from "@pierre/diffs"
import type { FileDiffMetadata, VirtualFileMetrics } from "@pierre/diffs/react"
import type {
  PendingReviewCommentInput,
  ReviewFilePatch,
  ReviewFileStatus
} from "@projectproject/shared"

type DiffStyle = "unified" | "split"

const DIFF_METRICS: VirtualFileMetrics = {
  hunkLineCount: 20,
  lineHeight: 20,
  diffHeaderHeight: 0,
  hunkSeparatorHeight: 28,
  spacing: 16
}

export function ReviewFileDiffBlock({
  file,
  diffStyle,
  onSelectedRange
}: {
  file: ReviewFilePatch
  diffStyle: DiffStyle
  onSelectedRange: (
    range: Omit<PendingReviewCommentInput, "body"> | null
  ) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [selectedLines, setSelectedLines] = useState<SelectedLineRange | null>(
    null
  )
  const fileDiff = useMemo(() => buildPierreFileDiff(file), [file])
  const unavailable = file.summary.binary || file.tooLarge || fileDiff === null

  function updateSelection(range: SelectedLineRange | null) {
    setSelectedLines(range)
    onSelectedRange(
      range
        ? mapPierreSelectionToPendingComment(file.summary.filename, range)
        : null
    )
  }

  return (
    <section
      id={fileBlockId(file.summary.filename)}
      data-review-file={file.summary.filename}
      className="scroll-mt-24 overflow-hidden rounded-lg border border-border bg-background"
    >
      <header className="sticky top-0 z-10 flex min-w-0 items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={
            collapsed ? m.reviews_file_expand() : m.reviews_file_collapse()
          }
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? (
            <SquareChevronRight className="size-4" strokeWidth={1.75} />
          ) : (
            <SquareChevronDown className="size-4" strokeWidth={1.75} />
          )}
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate font-mono text-sm">
              {file.summary.filename}
            </span>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {fileStatusLabel(file.summary.status)}
            </span>
          </div>
          {file.summary.previousFilename && (
            <p className="truncate text-xs text-muted-foreground">
              {m.reviews_file_previous_name({
                name: file.summary.previousFilename
              })}
            </p>
          )}
        </div>
        <div className="hidden items-center gap-2 font-mono text-xs sm:flex">
          <span className="inline-flex items-center gap-1 text-state-success">
            <Plus className="size-3" strokeWidth={2} aria-hidden />
            {file.summary.additions}
          </span>
          <span className="inline-flex items-center gap-1 text-state-danger">
            <Minus className="size-3" strokeWidth={2} aria-hidden />
            {file.summary.deletions}
          </span>
        </div>
        <Button
          render={<a href={file.htmlUrl} target="_blank" rel="noreferrer" />}
          size="icon-sm"
          variant="ghost"
          aria-label={m.reviews_file_open_github()}
        >
          <ExternalLink className="size-4" strokeWidth={1.75} />
        </Button>
      </header>
      {!collapsed && (
        <div className="bg-background">
          {unavailable ? (
            <NeutralFileState />
          ) : (
            <FileDiff
              fileDiff={fileDiff}
              metrics={DIFF_METRICS}
              selectedLines={selectedLines}
              className="block min-w-0 overflow-hidden [font-family:var(--font-mono)] text-[12px] leading-5"
              options={{
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
                disableFileHeader: true,
                tokenizeMaxLineLength: 500,
                maxLineDiffLength: 500,
                onLineSelected: updateSelection
              }}
            />
          )}
        </div>
      )}
    </section>
  )
}

function NeutralFileState() {
  return (
    <div className="flex min-h-28 items-center gap-3 px-4 py-5 text-sm text-muted-foreground">
      <FileWarning className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
      <span>{m.reviews_file_binary()}</span>
    </div>
  )
}

export function buildPierreFileDiff(
  file: ReviewFilePatch
): FileDiffMetadata | null {
  if (file.summary.binary || file.tooLarge || !file.patch) return null
  const patch = [
    `diff --git ${gitPath("a", file.summary.previousFilename ?? file.summary.filename)} ${gitPath("b", file.summary.filename)}`,
    file.summary.status === "added"
      ? "--- /dev/null"
      : `--- ${gitPath("a", file.summary.previousFilename ?? file.summary.filename)}`,
    file.summary.status === "removed"
      ? "+++ /dev/null"
      : `+++ ${gitPath("b", file.summary.filename)}`,
    file.patch
  ].join("\n")
  const parsed = parsePatchFiles(patch)[0]?.files[0]
  return parsed
    ? { ...parsed, cacheKey: `${file.summary.filename}:${file.patch}` }
    : null
}

export function mapPierreSelectionToPendingComment(
  path: string,
  range: SelectedLineRange
): Omit<PendingReviewCommentInput, "body"> {
  const start = Math.min(range.start, range.end)
  const end = Math.max(range.start, range.end)
  const side = (range.endSide ?? range.side) === "deletions" ? "left" : "right"
  return {
    path,
    side,
    line: end,
    ...(start === end ? {} : { startLine: start })
  }
}

export function fileBlockId(path: string): string {
  return `review-file-${encodeURIComponent(path)}`
}

function gitPath(prefix: "a" | "b", path: string): string {
  return `${prefix}/${path}`
}

function fileStatusLabel(status: ReviewFileStatus): string {
  switch (status) {
    case "added":
      return m.reviews_file_status_added()
    case "removed":
      return m.reviews_file_status_removed()
    case "renamed":
      return m.reviews_file_status_renamed()
    case "copied":
      return m.reviews_file_status_copied()
    case "changed":
      return m.reviews_file_status_changed()
    case "unchanged":
      return m.reviews_file_status_unchanged()
    case "modified":
    default:
      return m.reviews_file_status_modified()
  }
}
