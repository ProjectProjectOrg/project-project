import { useRouter } from "@tanstack/react-router"
import { useEffect } from "react"

import { loadLexicalEditor } from "@/features/editor/components/LexicalEditor"
import { loadMarkdown } from "@/features/editor/components/Markdown"

export function usePreloadRouteCode() {
  const router = useRouter()
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMarkdown()
      void loadLexicalEditor()
      for (const route of Object.values(router.routesById))
        void router.loadRouteChunk(route)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [router])
}
