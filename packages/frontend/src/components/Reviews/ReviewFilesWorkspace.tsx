import { Result, useAtomValue } from "@effect-atom/atom-react"
import {
  FileCode2,
  GitPullRequestArrow,
  Rows3,
  SquareSplitHorizontal
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { CodeViewHandle } from "@pierre/diffs/react"
import { ReviewDiffPane } from "@/components/Reviews/ReviewDiffPane"
import { ReviewFileTree } from "@/components/Reviews/ReviewFileTree"
import { SEGMENTED_ITEM_CLASS, SegmentedTabs } from "@/components/SegmentedTabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorPage } from "@/components/ErrorPage"
import {
  reviewFileSummariesAtom,
  reviewFilesAtom,
  reviewKey
} from "@/atoms/reviews"
import { m } from "@/paraglide/messages"
import type {
  PendingReviewCommentInput,
  ReviewPage
} from "@projectproject/shared"

type DiffStyle = "unified" | "split"

const DIFF_STYLE_ITEMS = [
  { key: "unified", label: m.reviews_diff_unified(), icon: Rows3 },
  { key: "split", label: m.reviews_diff_split(), icon: SquareSplitHorizontal }
] as const

export function ReviewFilesWorkspace({
  orgSlug,
  slug,
  prNumber,
  review
}: {
  orgSlug: string
  slug: string
  prNumber: number
  review: ReviewPage
}) {
  const key = reviewKey(orgSlug, slug, prNumber)
  const summariesResult = useAtomValue(reviewFileSummariesAtom(key))
  const filesResult = useAtomValue(reviewFilesAtom(key))
  const [desktopDiffStyle, setDesktopDiffStyle] = useState<DiffStyle>("split")
  const narrow = useMediaQuery("(max-width: 767px)")
  const viewerRef = useRef<CodeViewHandle<undefined> | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [selectedRange, setSelectedRange] = useState<Omit<
    PendingReviewCommentInput,
    "body"
  > | null>(null)
  const summaries = Result.isSuccess(summariesResult)
    ? summariesResult.value.items
    : []
  const diffStyle = narrow ? "unified" : desktopDiffStyle

  const selectFile = useCallback((path: string) => {
    const viewer = viewerRef.current
    if (!viewer) return
    const item = viewer.getItem(path)
    if (!item) return
    if (item.collapsed === true) {
      item.collapsed = false
      item.version = typeof item.version === "number" ? item.version + 1 : 1
      viewer.updateItem(item)
    }
    viewer.scrollTo({
      type: "item",
      id: path,
      align: "start",
      behavior: "smooth"
    })
  }, [])
  const selectedRangeLabel = selectedRange
    ? m.reviews_selected_range({
        path: selectedRange.path,
        line: selectedRange.line
      })
    : m.reviews_selected_range_empty()

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-6 overflow-hidden">
      <header className="flex min-w-0 shrink-0 items-center gap-3 border-b border-border/70 pb-3">
        <GitPullRequestArrow
          className="size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="shrink-0 font-mono text-sm text-muted-foreground">
          #{review.pr.number}
        </span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
          {review.pr.title}
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileCode2 className="size-3.5" strokeWidth={1.75} aria-hidden />
            {m.reviews_counts_files({ count: review.pr.counts.filesChanged })}
          </span>
          <span className="font-mono text-xs tabular-nums text-state-success">
            +{review.pr.counts.additions}
          </span>
          <span className="font-mono text-xs tabular-nums text-state-danger">
            -{review.pr.counts.deletions}
          </span>
          <SegmentedTabs
            items={DIFF_STYLE_ITEMS}
            layoutId="review-diff-style"
            variant="inline"
            className="hidden rounded-lg border border-border bg-background p-1 md:inline-flex"
            isActive={(key) => desktopDiffStyle === key}
            renderItem={(item, content, { active }) => (
              <button
                type="button"
                className={SEGMENTED_ITEM_CLASS(active, "inline")}
                onClick={() => setDesktopDiffStyle(item.key)}
              >
                {content}
              </button>
            )}
          />
          {selectedRange && (
            <Badge tone="muted" className="max-w-[14rem]">
              <span className="truncate">{selectedRangeLabel}</span>
            </Badge>
          )}
          <Button
            type="button"
            size="md"
            variant="primary"
            className="text-sm font-medium bg-state-success text-background hover:bg-state-success/90 active:bg-state-success/80"
          >
            {m.reviews_action_submit_review()}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 min-w-0 flex-1 gap-x-6 overflow-hidden lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="hidden min-h-0 overflow-hidden lg:block lg:border-r lg:border-border/60 lg:pr-6">
          <ReviewFileTree files={summaries} onSelect={selectFile} />
        </aside>
        <main className="min-h-0 min-w-0 overflow-hidden">
          {Result.matchWithError(filesResult, {
            onInitial: () => <FilesLoading />,
            onError: (error) => (
              <ErrorPage
                contained
                error={error}
                title={m.reviews_error_files()}
              />
            ),
            onDefect: (defect) => (
              <ErrorPage
                contained
                error={defect}
                title={m.reviews_error_files()}
              />
            ),
            onSuccess: ({ value }) =>
              value.files.length === 0 ? (
                <FilesEmpty />
              ) : (
                <ReviewDiffPane
                  files={value.files}
                  diffStyle={diffStyle}
                  viewerRef={viewerRef}
                  scrollRef={scrollRef}
                  onSelectedRange={setSelectedRange}
                />
              )
          })}
        </main>
      </div>
    </div>
  )
}

function FilesLoading() {
  return <div className="h-full min-h-0 rounded-lg bg-muted/60" />
}

function FilesEmpty() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center text-sm text-muted-foreground">
      {m.reviews_files_empty()}
    </div>
  )
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const media = window.matchMedia(query)
    setMatches(media.matches)
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches)
    media.addEventListener("change", listener)
    return () => media.removeEventListener("change", listener)
  }, [query])

  return matches
}
