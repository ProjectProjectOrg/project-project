import { cva, type VariantProps } from "class-variance-authority"
import {
  Text as NativeText,
  type TextProps as NativeTextProps
} from "react-native"

import { cn } from "@/lib/cn"

export const textVariants = cva("font-sans text-foreground", {
  variants: {
    variant: {
      display: "text-[28px] leading-[34px] font-semibold tracking-[-0.28px]",
      headline: "text-2xl leading-[30px] font-semibold tracking-[-0.24px]",
      title: "text-lg leading-6 font-semibold",
      body: "text-[15px] leading-[22px]",
      muted: "text-[15px] leading-[22px] text-muted-foreground",
      label: "text-[13px] leading-[18px] font-medium",
      caption: "text-[13px] leading-[18px] text-muted-foreground",
      error: "text-[13px] leading-[18px] text-destructive",
      mono: "font-mono text-[15px] leading-[22px]"
    }
  },
  defaultVariants: { variant: "body" }
})

export type TextProps = Readonly<
  NativeTextProps & VariantProps<typeof textVariants>
>

export function Text({ variant, className, ...props }: TextProps) {
  return (
    <NativeText
      className={cn(textVariants({ variant }), className)}
      {...props}
    />
  )
}
