import { useAtomValue } from "@effect/atom-react"
import { useCallback } from "react"

import { currentUserId } from "@/features/auth/atoms/auth"
import {
  createLocalStorageCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"

import { RecentCommands, rememberCommand } from "../lib/recentCommands"

const recentCodec = createLocalStorageCodec(RecentCommands)

export function useRecentCommands() {
  const viewerId = useAtomValue(currentUserId)
  const [recent, store] = useLocalStorageState(
    `projectproject:recent-commands:${viewerId ?? ""}`,
    recentCodec,
    []
  )
  const remember = useCallback(
    (id: string) => store(rememberCommand(recent, id)),
    [recent, store]
  )
  return [recent, remember] as const
}
