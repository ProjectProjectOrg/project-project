import { requireNativeView } from "expo"
import type { ReactNode } from "react"

type FlowLayoutProps = Readonly<{
  spacing?: number
  lineSpacing?: number
  duration?: number
  children: ReactNode
}>

const NativeFlowLayout = requireNativeView<FlowLayoutProps>(
  "FlowLayout",
  "FlowLayoutView"
)

export function FlowLayout(props: FlowLayoutProps) {
  return <NativeFlowLayout {...props} />
}
