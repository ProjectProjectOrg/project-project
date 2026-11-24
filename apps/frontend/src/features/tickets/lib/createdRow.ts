// How long after it's made a ticket still counts as just created: long enough
// for a list to refetch it, short enough that opening a list later doesn't
// flash a ticket made a while ago.
export const JUST_CREATED_MS = 5000

export const isFresh = (at: number) => performance.now() - at < JUST_CREATED_MS
