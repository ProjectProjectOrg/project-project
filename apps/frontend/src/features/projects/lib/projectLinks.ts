import { parseFigmaUrl } from "@pp/shared"
import { isPaperDesignUrl } from "@pp/ui/editor/paper/paper-url"

export type ProjectLinkKind = "figma" | "paper" | "github" | "local" | "web"

const LOCAL_HOST =
  /^(localhost|127(\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|[^/:]+\.(local|test))(?=[:/]|$)/i

export const isLocalAddress = (address: string): boolean =>
  LOCAL_HOST.test(address.replace(/^[a-z][a-z\d+.-]*:\/\//i, ""))

export const linkHost = (url: string): string => URL.parse(url)?.host ?? url

export const displayUrl = (url: string): string =>
  url.replace(/^https?:\/\//i, "").replace(/\/$/, "")

export const linkKind = (url: string): ProjectLinkKind => {
  if (parseFigmaUrl(url) !== null) return "figma"
  if (isPaperDesignUrl(url)) return "paper"
  if (/^https?:\/\/(www\.)?github\.com\//i.test(url)) return "github"
  if (isLocalAddress(url)) return "local"
  return "web"
}
