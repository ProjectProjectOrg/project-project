const NEAR_END_DISTANCE_PX = 96

export type ScrollPosition = Readonly<{
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}>

export const isNearScrollEnd = ({
  scrollTop,
  scrollHeight,
  clientHeight
}: ScrollPosition): boolean =>
  scrollHeight - scrollTop - clientHeight <= NEAR_END_DISTANCE_PX
