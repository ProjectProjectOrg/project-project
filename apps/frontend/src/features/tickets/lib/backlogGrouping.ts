import { BacklogGrouping } from "@pp/shared"

import {
  createLocalStorageCodec,
  readLocalStorage,
  writeLocalStorage
} from "@/hooks/useLocalStorageState"

export type ParentGrouping = Extract<BacklogGrouping, "epic" | "parent">

export const groupingCodec = createLocalStorageCodec(BacklogGrouping)
export const DEFAULT_GROUPING: BacklogGrouping = "sprint"

export const backlogGroupingKey = (preferencesKey: string) =>
  `projectproject:backlog-grouping:${preferencesKey}`

export const readBacklogGrouping = (
  viewerId: string,
  orgSlug: string,
  slug: string
) =>
  readLocalStorage(
    backlogGroupingKey(`${viewerId}:${orgSlug}/${slug}`),
    groupingCodec,
    DEFAULT_GROUPING
  )

export const writeBacklogGrouping = (
  viewerId: string,
  orgSlug: string,
  slug: string,
  grouping: BacklogGrouping
) =>
  writeLocalStorage(
    backlogGroupingKey(`${viewerId}:${orgSlug}/${slug}`),
    groupingCodec,
    grouping
  )
