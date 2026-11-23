import { lazy, Suspense, useState, type ComponentType } from "react"

export function deferredComponent<Props extends object>(
  load: () => Promise<ComponentType<Props>>
) {
  let loaded: ComponentType<Props> | null = null
  const preload = () =>
    load().then((component) => {
      loaded = component
      return component
    })
  const Lazy = lazy(() =>
    preload().then((component) => ({ default: component }))
  )
  function Deferred(props: Props) {
    const [Component] = useState<ComponentType<Props>>(() => loaded ?? Lazy)
    return (
      <Suspense fallback={null}>
        <Component {...props} />
      </Suspense>
    )
  }
  return { Component: Deferred, preload }
}
