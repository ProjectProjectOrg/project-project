export const previewableUrl = (href: string | undefined): string | null => {
  if (href === undefined) return null
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  url.hash = ""
  return url.href
}

const comparable = (value: string): string =>
  value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
    .toLowerCase()

export const isBareUrlLabel = (label: string, href: string): boolean =>
  comparable(label) === comparable(href)
