import { useEffect, useState } from "react"

type Options = Readonly<{
  rootMargin?: string
  threshold?: number | number[]
}>

export function useInViewport<T extends Element>(options: Options = {}) {
  const [node, setNode] = useState<T | null>(null)
  const [intersecting, setIntersecting] = useState(false)
  const supported = typeof IntersectionObserver !== "undefined"

  useEffect(() => {
    if (!node || !supported) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setIntersecting(entry.isIntersecting)
      },
      {
        rootMargin: options.rootMargin ?? "100px",
        threshold: options.threshold ?? 0
      }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, supported, options.rootMargin, options.threshold])

  return [setNode, supported ? intersecting : node !== null] as const
}
