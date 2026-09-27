import { useEffect } from "react"
import { AccessibilityInfo } from "react-native"

export const useAnnouncement = (message: string | null | undefined) =>
  useEffect(() => {
    if (message !== null && message !== undefined) {
      AccessibilityInfo.announceForAccessibility(message)
    }
  }, [message])
