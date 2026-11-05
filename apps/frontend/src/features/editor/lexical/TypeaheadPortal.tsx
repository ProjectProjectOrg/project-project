import { useId, useLayoutEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { placeTypeahead } from "@/features/editor/lib/typeaheadPlacement"

const createHost = (): HTMLDivElement => {
  const host = document.createElement("div")
  host.style.position = "absolute"
  host.style.zIndex = "50"
  return host
}

const placeHost = (host: HTMLElement, anchor: HTMLElement) => {
  if (!anchor.isConnected) return
  const { top, left } = placeTypeahead({
    anchorTop: parseFloat(anchor.style.top) || 0,
    anchorLeft: parseFloat(anchor.style.left) || 0,
    lineHeight: parseFloat(anchor.style.height) || 0,
    menuWidth: host.offsetWidth,
    menuHeight: host.offsetHeight,
    viewport: {
      top: window.scrollY,
      left: window.scrollX,
      width: window.innerWidth,
      height: window.innerHeight
    }
  })
  host.style.top = `${top}px`
  host.style.left = `${left}px`
}

export function TypeaheadPortal({
  anchor,
  children
}: Readonly<{ anchor: HTMLElement; children: ReactNode }>) {
  const [host] = useState(createHost)
  const hostId = useId()

  useLayoutEffect(() => {
    host.id = hostId
    document.body.append(host)
    anchor.setAttribute("aria-owns", hostId)
    const place = () => placeHost(host, anchor)
    place()
    const anchorMoves = new MutationObserver(place)
    anchorMoves.observe(anchor, {
      attributes: true,
      attributeFilter: ["style"]
    })
    const menuResizes = new ResizeObserver(place)
    menuResizes.observe(host)
    return () => {
      anchorMoves.disconnect()
      menuResizes.disconnect()
      anchor.removeAttribute("aria-owns")
      host.remove()
    }
  }, [anchor, host, hostId])

  return createPortal(children, host)
}
