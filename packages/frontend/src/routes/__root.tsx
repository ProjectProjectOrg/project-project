import {
  createRootRouteWithContext,
  Outlet,
  useRouterState
} from "@tanstack/react-router"
import { useEffect } from "react"
import type { Registry } from "@effect-atom/atom-react"
import { ErrorPage } from "@/components/ErrorPage"
import { LoaderOverlay } from "@/components/Loader/LoaderOverlay"
import { NotFoundPage } from "@/components/NotFoundPage"
import { ShapeProvider } from "@/lib/shape-context"

export interface RouterContext {
  registry: Registry.Registry
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  notFoundComponent: () => (
    <ShapeProvider>
      <NotFoundPage />
    </ShapeProvider>
  ),
  errorComponent: ({ error, reset }) => (
    <ShapeProvider>
      <ErrorPage error={error} reset={reset} />
    </ShapeProvider>
  )
})

function RootComponent() {
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
    <ShapeProvider>
      <Outlet />
      <LoaderOverlay active={isLoading} />
    </ShapeProvider>
  )
}
