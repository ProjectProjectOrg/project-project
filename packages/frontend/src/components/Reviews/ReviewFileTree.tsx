import { FileTree, useFileTree } from "@pierre/trees/react"
import { useMemo, type CSSProperties } from "react"
import { m } from "@/paraglide/messages"
import type { ReviewFileSummary } from "@projectproject/shared"
import type { FileTreeOptions } from "@pierre/trees"

type FileTreeSortComparator = Exclude<
  NonNullable<FileTreeOptions["sort"]>,
  "default"
>

const preserveInputOrderSort: FileTreeSortComparator = () => 0

const fileTreeStyle: CSSProperties = {
  "--trees-bg-override": "transparent",
  "--trees-bg-muted-override":
    "color-mix(in oklab, var(--accent) 60%, transparent)",
  "--trees-fg-override": "var(--foreground)",
  "--trees-fg-muted-override": "var(--muted-foreground)",
  "--trees-accent-override": "var(--foreground)",
  "--trees-border-color-override": "transparent",
  "--trees-indent-guide-bg-override": "transparent",
  "--trees-selected-bg-override": "var(--accent)",
  "--trees-selected-fg-override": "var(--foreground)",
  "--trees-selected-focused-border-color-override": "transparent",
  "--trees-focus-ring-color-override": "transparent",
  "--trees-focus-ring-width-override": "0px",
  "--trees-focus-ring-offset-override": "0px",
  "--trees-font-family-override": "var(--font-sans)",
  "--trees-font-size-override": "13px",
  "--trees-search-bg-override": "transparent",
  "--trees-search-fg-override": "var(--foreground)",
  "--trees-file-icon-color": "var(--muted-foreground)",
  "--trees-padding-inline-override": "0px",
  "--trees-item-padding-x-override": "8px"
} as CSSProperties

export function ReviewFileTree({
  files,
  onSelect
}: {
  files: ReadonlyArray<ReviewFileSummary>
  onSelect: (path: string) => void
}) {
  const paths = useMemo(() => files.map((file) => file.filename), [files])
  const statsByPath = useMemo(() => {
    const map = new Map<string, { additions: number; deletions: number }>()
    for (const file of files) {
      map.set(file.filename, {
        additions: file.additions,
        deletions: file.deletions
      })
    }
    return map
  }, [files])

  const { model } = useFileTree({
    paths,
    presorted: true,
    sort: preserveInputOrderSort,
    search: true,
    initialExpansion: "open",
    icons: "minimal",
    onSelectionChange: (selectedPaths) => {
      const next = selectedPaths[0]
      if (next) onSelect(next)
    },
    renderRowDecoration: ({ row }) => {
      if (row.kind !== "file") return null
      const stats = statsByPath.get(row.path)
      if (!stats) return null
      return { text: `+${stats.additions} -${stats.deletions}` }
    }
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <FileTree
        model={model}
        aria-label={m.reviews_files_tree_label()}
        className="min-h-0 flex-1"
        style={fileTreeStyle}
      />
    </div>
  )
}
