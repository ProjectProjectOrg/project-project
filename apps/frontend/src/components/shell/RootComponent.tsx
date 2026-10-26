import { Outlet, useRouterState } from "@tanstack/react-router"
import { useEffect } from "react"

import { LoaderOverlay } from "@/components/shell/LoaderOverlay"

export function RootComponent() {
  const isLoading = useRouterState({ select: (s) => s.isLoading })

  useEffect(() => {
    document.documentElement.setAttribute("data-app-ready", "")
    const boot = document.getElementById("app-loader")
    if (!boot) return
    const remove = () => boot.remove()
    boot.addEventListener("transitionend", remove, { once: true })
    return () => boot.removeEventListener("transitionend", remove)
  }, [])

  return (
    <>
      <Outlet />
      <LoaderOverlay active={isLoading} />
    </>
  )
}
