import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

const typeRoles = ["display", "title", "subtitle", "body", "caption", "micro"]

const surfaceShadows = [1, 2, 3, 4, 5, 6, 7, 8].map(
  (level) => `surface-${level}`
)

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [{ shadow: [...surfaceShadows, "surface-1-hover"] }],
      "font-size": [
        { text: [...typeRoles, ...typeRoles.map((role) => `${role}-compact`)] }
      ]
    }
  }
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
