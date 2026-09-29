import { Host } from "@expo/ui/swift-ui"
import { requireNativeView } from "expo"
import {
  Children,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode
} from "react"
import { useCSSVariable } from "uniwind"

import type { SymbolName } from "@/components/icons/Symbol"
import { transitions } from "@/lib/motion"

import { FlowLayout } from "./flow-layout"

type NativeItem = Readonly<{
  id: string
  title: string
  systemImage?: string
  checked: boolean
  destructive: boolean
}>

type NativeSection = Readonly<{
  title?: string
  items: ReadonlyArray<NativeItem>
}>

type NativeMenuButtonProps = Readonly<{
  title: string
  systemImage: string
  imageColor?: string
  imageLevel?: number
  textColor: string
  fillColor: string
  sections: ReadonlyArray<NativeSection>
  menuAccessibilityLabel?: string
  onSelect: (event: Readonly<{ nativeEvent: Readonly<{ id: string }> }>) => void
}>

const NativeMenuButton = requireNativeView<NativeMenuButtonProps>(
  "FlowLayout",
  "MenuButtonView"
)

type GroupProps = Readonly<{ title?: string; children: ReactNode }>

type RadioGroupProps<T extends string> = Readonly<{
  value: T
  onValueChange: (value: T) => void
  children: ReactNode
}>

type RadioItemProps = Readonly<{
  value: string
  icon?: SymbolName
  children: string
}>

type CheckboxItemProps = Readonly<{
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  icon?: SymbolName
  children: string
}>

type ItemProps = Readonly<{
  onSelect: () => void
  icon?: SymbolName
  variant?: "default" | "destructive"
  children: string
}>

function MenuGroup(_props: GroupProps) {
  return null
}

function MenuRadioGroup<T extends string>(_props: RadioGroupProps<T>) {
  return null
}

function MenuRadioItem(_props: RadioItemProps) {
  return null
}

function MenuCheckboxItem(_props: CheckboxItemProps) {
  return null
}

function MenuItem(_props: ItemProps) {
  return null
}

function MenuSeparator() {
  return null
}

type MutableSection = { title?: string; items: Array<NativeItem> }

const elementsOf = (children: ReactNode): ReadonlyArray<ReactElement> =>
  Children.toArray(children).flatMap((child) =>
    isValidElement<Readonly<{ children?: ReactNode }>>(child)
      ? child.type === Fragment
        ? elementsOf(child.props.children)
        : [child]
      : []
  )

type Descriptor<P> = (props: P) => null

const isElementOf = <P,>(
  element: ReactElement,
  component: Descriptor<P>
): element is ReactElement<P> => element.type === component

const matchElement = <P,>(element: ReactElement, component: Descriptor<P>) =>
  isElementOf(element, component) ? element : undefined

const parseMenu = (children: ReactNode) => {
  const sections: Array<MutableSection> = []
  const handlers = new Map<string, () => void>()
  let current: MutableSection = { items: [] }
  const close = () => {
    if (current.items.length > 0) sections.push(current)
    current = { items: [] }
  }
  const add = (item: NativeItem, handler: () => void) => {
    current.items.push(item)
    handlers.set(item.id, handler)
  }
  const walk = (nodes: ReactNode, path: string) => {
    elementsOf(nodes).forEach((element, index) => {
      const id = `${path}.${index}`
      const group = matchElement(element, MenuGroup)
      const radioGroup = matchElement<RadioGroupProps<string>>(
        element,
        MenuRadioGroup
      )
      const checkbox = matchElement(element, MenuCheckboxItem)
      const item = matchElement(element, MenuItem)
      if (matchElement(element, MenuSeparator) !== undefined) {
        close()
      } else if (group !== undefined) {
        close()
        current.title = group.props.title
        walk(group.props.children, id)
        close()
      } else if (radioGroup !== undefined) {
        const { value: selected, onValueChange } = radioGroup.props
        close()
        elementsOf(radioGroup.props.children).forEach((child) => {
          const option = matchElement(child, MenuRadioItem)
          if (option === undefined) return
          const { value, icon, children: title } = option.props
          add(
            {
              id: `${id}:${value}`,
              title,
              systemImage: icon,
              checked: value === selected,
              destructive: false
            },
            () => onValueChange(value)
          )
        })
        close()
      } else if (checkbox !== undefined) {
        const {
          checked,
          onCheckedChange,
          icon,
          children: title
        } = checkbox.props
        add({ id, title, systemImage: icon, checked, destructive: false }, () =>
          onCheckedChange(!checked)
        )
      } else if (item !== undefined) {
        const { onSelect, icon, variant, children: title } = item.props
        add(
          {
            id,
            title,
            systemImage: icon,
            checked: false,
            destructive: variant === "destructive"
          },
          onSelect
        )
      }
    })
  }
  walk(children, "0")
  close()
  return { sections, handlers }
}

function MenuRoot({
  icon,
  iconColor,
  iconLevel,
  label,
  accessibilityLabel,
  children
}: Readonly<{
  icon: SymbolName
  iconColor?: string
  iconLevel?: number
  label: string
  accessibilityLabel?: string
  children: ReactNode
}>) {
  const [foreground, muted, fill] = useCSSVariable([
    "--color-foreground",
    "--color-muted-foreground",
    "--color-muted"
  ]).map(String)
  const { sections, handlers } = parseMenu(children)
  return (
    <NativeMenuButton
      title={label}
      systemImage={icon}
      imageColor={iconColor ?? muted}
      imageLevel={iconLevel}
      textColor={foreground}
      fillColor={fill}
      sections={sections}
      menuAccessibilityLabel={accessibilityLabel}
      onSelect={({ nativeEvent }) => handlers.get(nativeEvent.id)?.()}
    />
  )
}

function MenuBar({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
      <FlowLayout
        spacing={6}
        lineSpacing={6}
        duration={transitions.fade.duration / 1000}
      >
        {children}
      </FlowLayout>
    </Host>
  )
}

export const Menu = Object.assign(MenuRoot, {
  Bar: MenuBar,
  Group: MenuGroup,
  RadioGroup: MenuRadioGroup,
  RadioItem: MenuRadioItem,
  CheckboxItem: MenuCheckboxItem,
  Item: MenuItem,
  Separator: MenuSeparator
})
