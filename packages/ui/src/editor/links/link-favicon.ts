import type { LinkPreview } from "@pp/shared"

/*
 * A link's favicon, painted onto the link itself (prose.css draws it from
 * the data attributes and --link-favicon), and the preview a link shows:
 * its page title and favicon. The app loads previews (EditorServices
 * LinkPreview); these are how they look.
 */

export type LinkFavicon = Readonly<
  | { kind: "pending" }
  | {
      kind: "image"
      src: string
      cached: boolean
      rendering: LinkPreview["faviconRendering"]
    }
  | { kind: "fallback"; cached: boolean }
>

export type LinkPreviewView = Readonly<{
  title: string | null
  favicon: LinkFavicon
}>

export const paintLinkFavicon = (
  element: HTMLElement,
  favicon: LinkFavicon,
  animate = favicon.kind !== "pending" && !favicon.cached
) => {
  element.dataset["linkFavicon"] = favicon.kind
  element.dataset["linkFaviconRendering"] =
    favicon.kind === "image" ? favicon.rendering : "original"
  element.dataset["linkFaviconAnimate"] = String(animate)
  if (favicon.kind === "image") {
    element.style.setProperty(
      "--link-favicon",
      `url(${JSON.stringify(favicon.src)})`
    )
  } else {
    element.style.removeProperty("--link-favicon")
  }
}
