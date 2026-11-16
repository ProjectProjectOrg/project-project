import { TAG_DEFAULT_PALETTE } from "@pp/shared"

// Sample projects for the demos: an id, a colour from the app's outer ring
// and a starter emoji, as new projects get them.
export const PROJECTS = [
  {
    id: "atlas-mobile-app",
    name: "Atlas Mobile App",
    color: "#e271b5",
    icon: "🧭"
  },
  {
    id: "billing-platform",
    name: "Billing Platform",
    color: "#53a0ff",
    icon: "💳"
  },
  {
    id: "marketing-site",
    name: "Marketing Site",
    color: "#ed7940",
    icon: "📣"
  },
  { id: "hello", name: "Hello", color: "#70b445", icon: "🪐" },
  { id: "design-system", name: "Design System", color: "#968dfd", icon: "🎨" },
  { id: "infra", name: "Infra", color: "#00bbbd", icon: "🛠" }
] as const

// The outer ring, which new projects get their colour from.
export const COLORS = TAG_DEFAULT_PALETTE.slice(0, 12)

export const EMOJIS = [
  "🧭",
  "💳",
  "📣",
  "🪐",
  "🎨",
  "🛠",
  "🌱",
  "🚀",
  "📦",
  "🧪",
  "🗺️",
  "⚡️"
] as const
