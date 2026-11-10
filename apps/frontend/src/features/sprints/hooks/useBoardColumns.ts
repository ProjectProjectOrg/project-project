import { useAtomValue } from "@effect/atom-react"
import { useCallback, useMemo } from "react"

import { currentUserId } from "@/features/auth/atoms/auth"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  createLocalStorageCodec,
  useLocalStorageSelect
} from "@/hooks/useLocalStorageState"

import {
  BoardColumnLayout,
  EMPTY_BOARD_LAYOUT,
  toggleSlug
} from "../lib/boardColumns"

export type BoardScope = "backlog" | "sprints"

export type BoardColumns = Readonly<{
  hidden: ReadonlyArray<string>
  collapsed: ReadonlyArray<string>
  toggleHidden: (slug: string) => void
  toggleCollapsed: (slug: string) => void
  showAll: () => void
}>

const layoutCodec = createLocalStorageCodec(BoardColumnLayout)

const identity = (layout: BoardColumnLayout) => layout

export function useBoardColumns(scope: BoardScope): BoardColumns {
  const { orgSlug, slug } = useProjectRoute()
  const viewerId = useAtomValue(currentUserId)
  const key = `projectproject:board-columns:${viewerId ?? ""}:${orgSlug}/${slug}/${scope}`
  const [layout, update] = useLocalStorageSelect(
    key,
    layoutCodec,
    EMPTY_BOARD_LAYOUT,
    identity
  )
  const toggleHidden = useCallback(
    (status: string) =>
      update((current) => ({
        hidden: toggleSlug(current.hidden, status),
        collapsed: current.collapsed.filter((s) => s !== status)
      })),
    [update]
  )
  const toggleCollapsed = useCallback(
    (status: string) =>
      update((current) => ({
        ...current,
        collapsed: toggleSlug(current.collapsed, status)
      })),
    [update]
  )
  const showAll = useCallback(
    () => update((current) => ({ ...current, hidden: [] })),
    [update]
  )
  return useMemo(
    () => ({
      hidden: layout.hidden,
      collapsed: layout.collapsed,
      toggleHidden,
      toggleCollapsed,
      showAll
    }),
    [layout, toggleHidden, toggleCollapsed, showAll]
  )
}
