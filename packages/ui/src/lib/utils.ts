import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

const typeRoles = ["display", "title", "subtitle", "body", "caption", "micro"]

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: [...typeRoles, ...typeRoles.map((role) => `${role}-compact`)] }
      ]
    }
  }
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
