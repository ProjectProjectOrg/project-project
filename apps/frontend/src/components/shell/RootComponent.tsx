import { TooltipHost } from "@pp/ui/tooltip"
import { Outlet, useRouterState } from "@tanstack/react-router"
import { useEffect } from "react"

import { LoaderOverlay } from "@/components/shell/LoaderOverlay"
import { AppEditorServices } from "@/features/editor/AppEditorServices"

export function RootComponent() {
  const isLoading = useRouterState({ select: (s) => s.isLoading })

  useEffect(() => {
    const boot = document.getElementById("app-loader")
    if (!boot) return
    const remove = () => boot.remove()
    boot.addEventListener("transitionend", remove, { once: true })
    return () => boot.removeEventListener("transitionend", remove)
  }, [])

  useEffect(() => {
    if (!isLoading) document.documentElement.setAttribute("data-app-ready", "")
  }, [isLoading])

  return (
    <>
      {/* The editor's data and navigation, for every editor in the app. */}
      <AppEditorServices>
        <Outlet />
      </AppEditorServices>
      <LoaderOverlay active={isLoading} />
      {/* The one tooltip for the whole app; every TooltipTrigger feeds it. */}
      <TooltipHost />
    </>
  )
}
