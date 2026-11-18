import { OUTER_RING } from "../colors"

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

const djb2 = (s: string) => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export const deriveProjectIcon = (slug: string) =>
  PROJECT_STARTER_EMOJIS[djb2(slug) % PROJECT_STARTER_EMOJIS.length]

export const deriveProjectColor = (slug: string) =>
  OUTER_RING[djb2(`${slug}:color`) % OUTER_RING.length].hex

export const deriveProjectIdentity = (slug: string) => ({
  icon: deriveProjectIcon(slug),
  color: deriveProjectColor(slug)
})
