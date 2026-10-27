import { createRootRouteWithContext } from "@tanstack/react-router"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { NotFoundPage } from "@/components/shell/NotFoundPage"
import { RootComponent } from "@/components/shell/RootComponent"
import { ShapeProvider } from "@/lib/shapeContext"

export interface RouterContext {
  registry: AtomRegistry
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
