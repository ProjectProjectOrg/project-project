import { cn } from "@pp/ui/lib/utils"
import type { MDXComponents } from "mdx/types"
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode
} from "react"

import { CodeView } from "./CodeView"
import { Demo } from "./Demo"
import { Heading } from "./Heading"
import { InlineCode } from "./InlineCode"

const codeElementOf = (
  children: ReactNode
): ReactElement<{ className?: string; children?: ReactNode }> | undefined =>
  Children.toArray(children).find(
    (
      child
    ): child is ReactElement<{ className?: string; children?: ReactNode }> =>
      isValidElement(child)
  )

const languageOf = (children: ReactNode): string =>
  codeElementOf(children)?.props.className?.replace("language-", "") ?? "tsx"

const codeOf = (children: ReactNode): string => {
  const code = codeElementOf(children)?.props.children
  return Children.toArray(code)
    .filter((part) => typeof part === "string")
    .join("")
}

export const mdxComponents: MDXComponents = {
  Demo,
  h1: ({ className, children, ...props }) => (
    <h1 className={cn("mb-3 text-display font-semibold", className)} {...props}>
      {children}
    </h1>
  ),
  h2: ({ className, children }) => (
    <Heading
      level={2}
      className={cn("mt-14 mb-3 text-title font-semibold", className)}
    >
      {children}
    </Heading>
  ),
  h3: ({ className, children }) => (
    <Heading
      level={3}
      className={cn("mt-8 mb-2 text-subtitle font-semibold", className)}
    >
      {children}
    </Heading>
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn(
        "my-3 max-w-prose text-subtitle leading-6 text-muted-foreground",
        className
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn(
        "my-3 flex max-w-prose list-disc flex-col gap-2 pl-5 text-subtitle leading-6 text-muted-foreground marker:text-border",
        className
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn(
        "my-4 flex max-w-prose list-decimal flex-col gap-3 pl-6 text-subtitle leading-6 text-muted-foreground marker:text-muted-foreground marker:tabular-nums",
        className
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li className={cn("pl-1", className)} {...props} />
  ),
  strong: ({ className, ...props }) => (
    <strong
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  ),
  a: ({ className, children, ...props }) => (
    <a
      className={cn(
        "text-foreground underline decoration-[color-mix(in_oklab,currentColor_35%,transparent)] underline-offset-4 transition-colors hover:decoration-foreground",
        className
      )}
      {...props}
    >
      {children}
    </a>
  ),
  table: ({ className, children, ...props }) => (
    <div className="my-6 overflow-x-auto rounded-[20px] bg-surface-2 corner-squircle">
      <div>
        <table
          className={cn(
            "w-full border-collapse text-left text-body",
            className
          )}
          {...props}
        >
          {children}
        </table>
      </div>
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "border-b border-border px-4 py-2.5 text-caption font-normal text-muted-foreground",
        className
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        "border-b border-border px-4 py-2.5 align-top [tr:last-child_&]:border-b-0",
        className
      )}
      {...props}
    />
  ),
  pre: ({ children }) => (
    <CodeView
      source={codeOf(children)}
      language={languageOf(children)}
      overflow="wrap"
      className="my-6 rounded-[20px] bg-surface-2 corner-squircle"
    />
  ),
  code: InlineCode
}
