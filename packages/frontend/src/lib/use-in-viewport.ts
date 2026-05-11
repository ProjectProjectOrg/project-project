"use client"

import { useEffect, useRef, useState } from "react"

interface Options {
  rootMargin?: string
  threshold?: number | number[]
}

export function useInViewport<T extends Element>(
  options: Options = {}
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === "undefined") {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setInView(entry.isIntersecting)
        }
      },
      {
        rootMargin: options.rootMargin ?? "100px",
        threshold: options.threshold ?? 0
      }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [options.rootMargin, options.threshold])

  return [ref, inView]
}
