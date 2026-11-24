export function objectUrl(blob: Blob) {
  const url = URL.createObjectURL(blob)
  return { url, release: () => URL.revokeObjectURL(url) }
}
