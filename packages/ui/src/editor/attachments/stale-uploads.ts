export const staleUploadIds = (
  tracked: Iterable<string>,
  live: ReadonlySet<string>
) => Array.from(tracked).filter((uploadId) => !live.has(uploadId))
