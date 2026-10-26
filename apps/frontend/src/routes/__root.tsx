import { createRootRouteWithContext } from "@tanstack/react-router"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { NotFoundPage } from "@/components/shell/NotFoundPage"
import { RootComponent } from "@/components/shell/RootComponent"

export interface RouterContext {
  registry: AtomRegistry
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  notFoundComponent: () => <NotFoundPage />,
  errorComponent: ({ error, reset }) => (
    <ErrorPage error={error} reset={reset} />
  )
})
