export const staleUploadIds = (
  tracked: Iterable<string>,
  live: ReadonlySet<string>
): ReadonlyArray<string> =>
  Array.from(tracked).filter((uploadId) => !live.has(uploadId))
