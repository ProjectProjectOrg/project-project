import { SearchIcon } from "@pp/ui/icons"
import { Input, type InputSize } from "@pp/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@pp/ui/input-group"
import { Kbd } from "@pp/ui/kbd"
import type { ReactNode } from "react"

function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-3">
      <div className="grid h-9 w-full grid-cols-[minmax(0,1fr)] place-items-center">
        {children}
      </div>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  )
}

function Large() {
  return (
    <div className="mx-auto flex w-full max-w-80 [zoom:2] flex-col gap-3 py-2">
      <Input placeholder="you@company.com" aria-label="Large" />
      <Search label="Large search" />
    </div>
  )
}

function Search({
  label,
  focused,
  disabled,
  className
}: Readonly<{
  label: string
  focused?: boolean
  disabled?: boolean
  className?: string
}>) {
  return (
    <InputGroup focused={focused} className={className}>
      <InputGroupAddon>
        <SearchIcon className="size-4" strokeWidth={1.75} />
      </InputGroupAddon>
      <InputGroupInput
        placeholder="Search"
        aria-label={label}
        disabled={disabled}
      />
      <Kbd aria-hidden>/</Kbd>
    </InputGroup>
  )
}

const SIZES: ReadonlyArray<readonly [InputSize, string]> = [
  ["lg", "Large"],
  ["md", "Medium"],
  ["sm", "Small"]
]

export default function Overview() {
  return (
    <div className="@container flex w-full flex-col gap-8">
      <Large />
      {/* Columns follow the demo's own width, and can shrink below their
          content, so the grid fits a half-width window too. */}
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] justify-items-center gap-x-4 gap-y-6 @2xl:grid-cols-[repeat(5,minmax(0,1fr))]">
        {SIZES.map(([size, name]) => (
          <Row key={size} name={name} size={size} />
        ))}
        <Cell caption="Group">
          <Search label="Group" />
        </Cell>
        <Cell caption="Group filled">
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon className="size-4" strokeWidth={1.75} />
            </InputGroupAddon>
            <InputGroupInput defaultValue="login" aria-label="Group filled" />
          </InputGroup>
        </Cell>
        <Cell caption="Group focus">
          <Search label="Group focus" focused />
        </Cell>
        {/* Keeps the group row in its columns on the wide grid. */}
        <div aria-hidden className="hidden @2xl:block" />
        <Cell caption="Group disabled">
          <Search label="Group disabled" disabled />
        </Cell>
        <Cell caption="Bare">
          <Input
            variant="bare"
            className="text-title font-semibold"
            placeholder="Ticket title"
            aria-label="Bare"
          />
        </Cell>
        <Cell caption="Bare hover">
          <Input
            variant="bare"
            data-force="hover"
            className="text-title font-semibold"
            placeholder="Ticket title"
            aria-label="Bare hover"
          />
        </Cell>
        <Cell caption="Bare focus">
          <Input
            variant="bare"
            data-force="focus"
            className="text-title font-semibold"
            placeholder="Ticket title"
            aria-label="Bare focus"
          />
        </Cell>
      </div>
    </div>
  )
}

// One size per row: empty, filled, focus, invalid, disabled.
function Row({ name, size }: Readonly<{ name: string; size: InputSize }>) {
  return (
    <>
      <Cell caption={name}>
        <Input size={size} placeholder="you@company.com" aria-label={name} />
      </Cell>
      <Cell caption={`${name}, filled`}>
        <Input
          size={size}
          defaultValue="Sprint 14"
          aria-label={`${name}, filled`}
        />
      </Cell>
      <Cell caption={`${name}, focus`}>
        <Input
          size={size}
          defaultValue="Sprint 14"
          aria-label={`${name}, focus`}
          data-force="focus"
        />
      </Cell>
      <Cell caption={`${name}, invalid`}>
        <Input
          size={size}
          defaultValue="Sprint 14"
          aria-label={`${name}, invalid`}
          aria-invalid
        />
      </Cell>
      <Cell caption={`${name}, disabled`}>
        <Input
          size={size}
          defaultValue="acme"
          aria-label={`${name}, disabled`}
          disabled
        />
      </Cell>
    </>
  )
}
