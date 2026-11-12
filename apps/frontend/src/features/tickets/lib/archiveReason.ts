export const archiveReason = (
  preset: string | null,
  details: string
): string | undefined => {
  const parts = [preset, details.trim()].filter(
    (part): part is string => part !== null && part !== ""
  )
  return parts.length === 0 ? undefined : parts.join(": ")
}
