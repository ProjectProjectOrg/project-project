const UNITS = ["B", "KB", "MB", "GB", "TB"] as const

export const formatBytes = (bytes: number, locale: string): string => {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: unit === 0 ? 0 : 1
  }).format(value)
  return `${formatted} ${UNITS[unit]}`
}
