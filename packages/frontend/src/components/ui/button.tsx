"use client"

import { forwardRef, type ButtonHTMLAttributes } from "react"
import { Slot, Slottable } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type { IconComponent } from "@/lib/icon-context"
import { cn } from "@/lib/utils"
import { useShape } from "@/lib/shape-context"
import { DitherBackdrop, type DitherDirection } from "./button-dither"

const buttonVariants = cva(
  [
    "group relative inline-flex items-center justify-center whitespace-nowrap outline-none cursor-pointer",
    "transition-all duration-100 active:scale-[0.97]",
    "disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100",
    "focus-visible:ring-1 focus-visible:ring-[#6B97FF]"
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/80",
        secondary:
          "bg-accent text-foreground hover:bg-accent/80 active:bg-accent",
        tertiary:
          "border border-border text-foreground bg-transparent hover:bg-muted active:bg-muted/60",
        ghost:
          "text-muted-foreground bg-transparent hover:bg-muted hover:text-foreground active:bg-muted/60",
        chip:
          "text-foreground bg-transparent hover:bg-accent hover:text-foreground active:bg-accent/80",
        dither: "bg-transparent overflow-hidden"
      },
      size: {
        xs: "h-5 px-1.5 text-[11px] gap-1",
        sm: "h-7 px-3 text-[12px] gap-1",
        md: "h-8 px-4 text-[13px] gap-1.5",
        lg: "h-9 px-5 text-[14px] gap-1.5",
        "icon-xs": "h-5 w-5 p-0 [&_svg]:h-3 [&_svg]:w-3",
        "icon-sm": "h-8 w-8 p-0 [&_svg]:h-3.5 [&_svg]:w-3.5",
        icon: "h-9 w-9 p-0 [&_svg]:h-4 [&_svg]:w-4",
        "icon-lg": "h-10 w-10 p-0 [&_svg]:h-5 [&_svg]:w-5"
      },
      iconLeft: { true: "" },
      iconRight: { true: "" }
    },
    compoundVariants: [
      { size: "xs", iconLeft: true, className: "pl-1" },
      { size: "sm", iconLeft: true, className: "pl-[6px]" },
      { size: "md", iconLeft: true, className: "pl-[10px]" },
      { size: "lg", iconLeft: true, className: "pl-[14px]" },
      { size: "xs", iconRight: true, className: "pr-1" },
      { size: "sm", iconRight: true, className: "pr-[6px]" },
      { size: "md", iconRight: true, className: "pr-[10px]" },
      { size: "lg", iconRight: true, className: "pr-[14px]" },
      {
        variant: "chip",
        className: "h-auto rounded-md px-1.5 py-0.5 text-[13px] gap-1.5"
      }
    ],
    defaultVariants: {
      variant: "primary",
      size: "md"
    }
  }
)

interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants>
{
  asChild?: boolean
  loading?: boolean
  leadingIcon?: IconComponent
  trailingIcon?: IconComponent
  ditherFrom?: string
  ditherTo?: string
  ditherDirection?: DitherDirection
  ditherImage?: string
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      leadingIcon: LeadingIcon,
      trailingIcon: TrailingIcon,
      disabled,
      children,
      style,
      ditherFrom,
      ditherTo,
      ditherDirection,
      ditherImage,
      ...htmlProps
    },
    ref
  ) => {
    const isDither = variant === "dither"

    const Comp = asChild ? Slot : "button"
    const isIconOnly =
      size === "icon" ||
      size === "icon-xs" ||
      size === "icon-sm" ||
      size === "icon-lg"
    const iconSize =
      size === "xs" ? 12 : size === "sm" ? 14 : size === "lg" ? 20 : 16
    const shape = useShape()

    const compClassName = cn(
      buttonVariants({
        variant,
        size,
        iconLeft: !isIconOnly && !!LeadingIcon,
        iconRight: !isIconOnly && !!TrailingIcon
      }),
      shape.button,
      className
    )

    const leadingIconNode = LeadingIcon && (
      <LeadingIcon
        size={iconSize}
        strokeWidth={1.5}
        className="transition-[stroke-width] duration-80 group-hover:stroke-[2]"
      />
    )
    const trailingIconNode = TrailingIcon && (
      <TrailingIcon
        size={iconSize}
        strokeWidth={1.5}
        className="transition-[stroke-width] duration-80 group-hover:stroke-[2]"
      />
    )

    const ditherBackdrop = isDither && (
      <DitherBackdrop
        from={ditherFrom}
        to={ditherTo}
        direction={ditherDirection}
        image={ditherImage}
      />
    )

    if (loading) {
      return (
        <Comp
          ref={ref}
          className={compClassName}
          disabled={disabled || loading}
          style={style}
          {...htmlProps}
        >
          {ditherBackdrop}
          <span className="relative z-10 flex items-center justify-center gap-[inherit] opacity-0">
            {LeadingIcon && !isIconOnly && (
              <LeadingIcon size={iconSize} strokeWidth={2} />
            )}
            {children}
            {TrailingIcon && !isIconOnly && (
              <TrailingIcon size={iconSize} strokeWidth={2} />
            )}
          </span>
          <span className="absolute inset-0 z-10 flex items-center justify-center">
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none">
              <path
                d="M 12 12 C 14 8.5 19 8.5 19 12 C 19 15.5 14 15.5 12 12 C 10 8.5 5 8.5 5 12 C 5 15.5 10 15.5 12 12 Z"
                stroke="currentColor"
                strokeWidth="1.125"
                strokeLinecap="round"
                pathLength="100"
                style={{
                  strokeDasharray: "15 85",
                  animation:
                    "spinner-move 2s linear infinite, spinner-dash 4s ease-in-out infinite"
                }}
              />
            </svg>
          </span>
        </Comp>
      )
    }

    if (isIconOnly) {
      return (
        <Comp
          ref={ref}
          className={compClassName}
          disabled={disabled}
          style={style}
          {...htmlProps}
        >
          {ditherBackdrop}
          <span className="relative z-10 [&_svg]:stroke-[1.5] [&_svg]:transition-[stroke-width] [&_svg]:duration-80 group-hover:[&_svg]:stroke-[2]">
            {children}
          </span>
        </Comp>
      )
    }

    return (
      <Comp
        ref={ref}
        className={compClassName}
        disabled={disabled}
        style={style}
        {...htmlProps}
      >
        {ditherBackdrop}
        <span className="relative z-10 inline-flex items-center gap-[inherit]">
          {leadingIconNode}
          <Slottable>{children}</Slottable>
          {trailingIconNode}
        </span>
      </Comp>
    )
  }
)

Button.displayName = "Button"

export { Button, buttonVariants }
export type { ButtonProps }
