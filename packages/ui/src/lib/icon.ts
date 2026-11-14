import type { ComponentType } from "react"

type IconComponentProps = Readonly<{
  size?: number
  strokeWidth?: number
  className?: string
}>

export type IconComponent = ComponentType<IconComponentProps>
