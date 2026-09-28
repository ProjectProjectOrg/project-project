import { View } from "react-native"

import { Text } from "@/components/ui/text"
import { cn } from "@/lib/cn"
import { PriorityIcon } from "@/tickets/PriorityIcon"
import { StatusIcon } from "@/tickets/StatusIcon"

import type { MyWorkSection, MyWorkTicket } from "./atoms"

export function MyWorkRow({
  item,
  section,
  first
}: Readonly<{ item: MyWorkTicket; section: MyWorkSection; first: boolean }>) {
  return (
    <View className="flex-row items-center gap-3 px-5">
      <StatusIcon status={section} />
      <View
        className={cn(
          "min-h-15 flex-1 flex-row items-center gap-3 py-2.5",
          !first && "border-t border-border"
        )}
      >
        <View className="flex-1 gap-0.5">
          <Text className="font-medium" numberOfLines={1}>
            {item.ticket.title}
          </Text>
          <View className="flex-row items-center gap-2">
            <Text variant="caption" className="font-mono">
              {item.ticket.id}
            </Text>
            <Text variant="caption" className="flex-1" numberOfLines={1}>
              {item.project.name}
            </Text>
          </View>
        </View>
        <PriorityIcon priority={item.ticket.priority} />
      </View>
    </View>
  )
}

export function MyWorkSectionHeader({
  section
}: Readonly<{ section: MyWorkSection }>) {
  return (
    <View className="flex-row items-center gap-2 px-5 pt-5 pb-1.5">
      <StatusIcon status={section} />
      <Text variant="label" className="text-muted-foreground">
        {section.label}
      </Text>
      <Text variant="label" className="text-muted-foreground tabular-nums">
        {section.data.length}
      </Text>
    </View>
  )
}
