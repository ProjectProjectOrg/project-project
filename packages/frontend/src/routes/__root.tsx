import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import type { Registry } from "@effect-atom/atom-react"
import { ErrorPage } from "@/components/ErrorPage"
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
  return (
    <ShapeProvider>
      <Outlet />
    </ShapeProvider>
  )
}
