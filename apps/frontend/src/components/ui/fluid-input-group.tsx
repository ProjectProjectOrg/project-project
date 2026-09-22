"use client"

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  createContext,
  useContext,
  forwardRef,
  type ReactNode,
  type HTMLAttributes,
  type InputHTMLAttributes
} from "react"

import { fontWeights } from "@/lib/font-weight"
import type { IconComponent } from "@/lib/icon-context"
import { useShape } from "@/lib/shape-context"
import { cn } from "@/lib/utils"

interface InputGroupContextValue {
  registerItem: (index: number, element: HTMLLabelElement | null) => void
  activeIndex: number | null
}

const InputGroupContext = createContext<InputGroupContextValue | null>(null)

function useInputGroup() {
  const ctx = useContext(InputGroupContext)
  if (!ctx) throw new Error("useInputGroup must be used within an InputGroup")
  return ctx
}

interface InputGroupProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

const InputGroup = forwardRef<HTMLDivElement, InputGroupProps>(
  ({ children, className, ...props }, ref) => {
    const itemsRef = useRef(new Map<number, HTMLLabelElement>())
    const [activeIndex, setActiveIndex] = useState<number | null>(null)

    const registerItem = useCallback(
      (index: number, element: HTMLLabelElement | null) => {
        if (element) {
          itemsRef.current.set(index, element)
        } else {
          itemsRef.current.delete(index)
        }
      },
      []
    )

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
      const mouseY = e.clientY

      let closestIndex: number | null = null
      let closestDistance = Infinity

      itemsRef.current.forEach((element, index) => {
        const rect = element.getBoundingClientRect()
        const itemCenterY = rect.top + rect.height / 2
        const distance = Math.abs(mouseY - itemCenterY)

        if (distance < closestDistance) {
          closestDistance = distance
          closestIndex = index
        }
      })

      setActiveIndex(closestIndex)
    }, [])

    const handleMouseLeave = useCallback(() => {
      setActiveIndex(null)
    }, [])

    return (
      <InputGroupContext.Provider value={{ registerItem, activeIndex }}>
        <div
          ref={ref}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className={cn("flex w-72 max-w-full flex-col gap-3", className)}
          {...props}
        >
          {children}
        </div>
      </InputGroupContext.Provider>
    )
  }
)

InputGroup.displayName = "InputGroup"

interface InputFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "index"
> {
  label: string
  placeholder?: string
  icon?: IconComponent
  index: number
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
  className?: string
}

const InputField = forwardRef<HTMLLabelElement, InputFieldProps>(
  (
    {
      label,
      placeholder,
      icon: Icon,
      index,
      value,
      onChange,
      error,
      disabled,
      className,
      ...props
    },
    ref
  ) => {
    const internalRef = useRef<HTMLLabelElement>(null)
    const { registerItem, activeIndex } = useInputGroup()
    const [isFocused, setIsFocused] = useState(false)
    const shape = useShape()

    useEffect(() => {
      registerItem(index, internalRef.current)
      return () => registerItem(index, null)
    }, [index, registerItem])

    const isActive = activeIndex === index
    const labelActive = isActive || isFocused

    const errorId = error ? `input-error-${index}` : undefined

    const handleFocus = () => {
      setIsFocused(true)
    }

    const handleBlur = () => {
      setIsFocused(false)
    }

    // Input container classes
    let bgClass: string
    let ringClass: string

    if (disabled) {
      bgClass = "bg-transparent"
      ringClass = "ring-border"
    } else if (error) {
      bgClass = isFocused
        ? "bg-card"
        : isActive
          ? "bg-destructive-light/60"
          : "bg-transparent"
      ringClass =
        isFocused || isActive ? "ring-destructive/50" : "ring-transparent"
    } else if (isFocused) {
      bgClass = "bg-card"
      ringClass = "ring-border"
    } else if (isActive) {
      bgClass = "bg-muted/50"
      ringClass = "ring-border"
    } else {
      bgClass = "bg-transparent"
      ringClass = "ring-transparent"
    }

    return (
      <label
        ref={(node) => {
          internalRef.current = node
          if (typeof ref === "function") ref(node)
          else if (ref) ref.current = node
        }}
        className={cn(
          "flex cursor-text flex-col gap-1",
          disabled && "pointer-events-none opacity-50",
          className
        )}
      >
        {/* Label */}
        <span className="inline-grid pl-3 text-[13px]">
          <span
            className="invisible col-start-1 row-start-1"
            style={{ fontVariationSettings: fontWeights.semibold }}
            aria-hidden="true"
          >
            {label}
          </span>
          <span
            className={cn(
              "col-start-1 row-start-1",
              error ? "text-destructive" : "text-muted-foreground"
            )}
            style={{
              fontVariationSettings: fontWeights.normal
            }}
          >
            {label}
          </span>
        </span>

        {/* Input container */}
        <div
          className={cn(
            `flex items-center gap-2 ${shape.input} px-3 py-2 ring-1 transition-all duration-80`,
            bgClass,
            ringClass
          )}
        >
          {Icon && (
            <Icon
              size={16}
              strokeWidth={labelActive ? 2 : 1.5}
              className={cn(
                "shrink-0 transition-[color,stroke-width] duration-80",
                labelActive ? "text-foreground" : "text-muted-foreground"
              )}
            />
          )}
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={!!error || undefined}
            aria-describedby={errorId}
            className="w-full bg-transparent font-[inherit] text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            style={{ fontVariationSettings: fontWeights.normal }}
            {...props}
          />
        </div>

        {/* Error message */}
        {error && (
          <span
            id={errorId}
            className="pl-3 text-[12px] text-destructive"
            style={{ fontVariationSettings: fontWeights.medium }}
          >
            {error}
          </span>
        )}
      </label>
    )
  }
)

InputField.displayName = "InputField"

export { InputGroup, InputField }
export default InputGroup
