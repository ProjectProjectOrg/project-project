const hasControlOrSpace = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) <= 0x20) return true
  }
  return false
}

export const safeInternalPath = (value: unknown, fallback = "/"): string => {
  if (typeof value !== "string") return fallback
  if (!value.startsWith("/")) return fallback
  if (value.startsWith("//")) return fallback
  if (value.includes("\\")) return fallback
  if (hasControlOrSpace(value)) return fallback
  return value
}
