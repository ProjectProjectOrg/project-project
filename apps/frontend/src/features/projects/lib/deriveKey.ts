export function deriveKey(name: string): string {
  const cleaned = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .trim()
  if (!cleaned) return ""
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ""
  const candidate =
    words.length >= 2
      ? words
          .slice(0, 6)
          .map((w) => w[0])
          .join("")
      : words[0].slice(0, 4)
  return candidate.replace(/^[0-9]+/, "").slice(0, 10)
}
