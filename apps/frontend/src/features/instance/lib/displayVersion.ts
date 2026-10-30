const SHORT_SHA_LENGTH = 7

export const displayVersion = (version: string) =>
  version.startsWith("sha-")
    ? version.slice(0, "sha-".length + SHORT_SHA_LENGTH)
    : version
