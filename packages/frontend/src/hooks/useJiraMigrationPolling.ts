import { useEffect } from "react"
import { useAtomSet } from "@effect/atom-react"
import type { JiraMigrationStatus } from "@projectproject/shared"
import {
  jiraMigrationKey,
  refreshJiraMigrationAtom
} from "@/atoms/jiraMigration"
import { isActiveJiraMigration } from "@/JiraMigration/screen"

const POLL_INTERVAL_MS = 2_000

export function useJiraMigrationPolling(
  orgSlug: string,
  migrationId: string,
  status: JiraMigrationStatus
) {
  const refresh = useAtomSet(
    refreshJiraMigrationAtom(jiraMigrationKey(orgSlug, migrationId))
  )
  const active = isActiveJiraMigration(status)

  useEffect(() => {
    if (!active || typeof document === "undefined") return undefined

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") refresh(undefined)
    }

    const interval = window.setInterval(refreshIfVisible, POLL_INTERVAL_MS)
    document.addEventListener("visibilitychange", refreshIfVisible)
    window.addEventListener("focus", refreshIfVisible)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", refreshIfVisible)
      window.removeEventListener("focus", refreshIfVisible)
    }
  }, [active, refresh])
}
