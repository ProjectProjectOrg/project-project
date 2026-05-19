import { OUTER_RING } from "./colors"

export const PROJECT_STARTER_EMOJIS = [
  "🚀",
  "📦",
  "🎯",
  "⚙️",
  "🧪",
  "📚",
  "🎨",
  "💡",
  "🔧",
  "🌱",
  "⚡",
  "🎮",
  "🛠",
  "🧭",
  "🔬",
  "📊",
  "🏗",
  "🪐",
  "🔮",
  "🏷"
] as const

const djb2 = (s: string): number => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export const deriveProjectIcon = (slug: string): string =>
  PROJECT_STARTER_EMOJIS[djb2(slug) % PROJECT_STARTER_EMOJIS.length]

export const deriveProjectColor = (slug: string): string =>
  OUTER_RING[djb2(`${slug}:color`) % OUTER_RING.length].hex

export const deriveProjectIdentity = (
  slug: string
): { icon: string; color: string } => ({
  icon: deriveProjectIcon(slug),
  color: deriveProjectColor(slug)
})
