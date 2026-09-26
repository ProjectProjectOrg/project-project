import { cva, type VariantProps } from "class-variance-authority"
import {
  Text as NativeText,
  type TextProps as NativeTextProps
} from "react-native"

import { cn } from "@/lib/cn"

export const textVariants = cva("font-sans text-foreground", {
  variants: {
    variant: {
      headline: "text-2xl font-semibold tracking-[-0.24px]",
      title: "text-lg font-semibold",
      body: "text-[15px] leading-[22px]",
      muted: "text-[15px] leading-[22px] text-muted-foreground",
      label: "text-[13px] font-medium",
      caption: "text-[13px] leading-[18px] text-muted-foreground",
      error: "text-[13px] leading-[18px] text-destructive",
      mono: "font-mono text-[15px]"
    }
  },
  defaultVariants: { variant: "body" }
})

export type TextProps = NativeTextProps & VariantProps<typeof textVariants>

export function Text({ variant, className, ...props }: TextProps) {
  return (
    <NativeText
      className={cn(textVariants({ variant }), className)}
      {...props}
    />
  )
}
