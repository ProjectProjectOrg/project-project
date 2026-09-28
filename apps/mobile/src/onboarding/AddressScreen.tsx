import { type NativeStackNavigationProp, useNavigation } from "expo-router"
import { useEffect } from "react"
import { ScrollView, View } from "react-native"

import { KeyboardDock } from "@/components/KeyboardDock"
import { Button } from "@/components/ui/button"
import { copy } from "@/copy"

import { AddressFields, useAddressForm } from "./AddressForm"
import { bandContentInset, DitherBand } from "./DitherBand"

// The address step as a screen of its own, for adding another server. First
// onboarding grows the same step out of the welcome screen instead.
export function AddressScreen({
  onChecked
}: Readonly<{ onChecked: () => void }>) {
  const { form, field } = useAddressForm(onChecked)

  const navigation =
    useNavigation<
      NativeStackNavigationProp<Readonly<Record<string, undefined>>>
    >()
  // Focus once the push has settled, so the keyboard slides up over the
  // screen. Focusing on focus runs before the push starts, and the keyboard
  // is then already up as the screen slides in.
  useEffect(
    () =>
      navigation.addListener("transitionEnd", ({ data }) => {
        if (!data.closing) field.current?.focus()
      }),
    [navigation, field]
  )

  return (
    <View className="flex-1 bg-dither-back">
      <DitherBand />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5"
        contentContainerStyle={{ paddingTop: bandContentInset }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <AddressFields form={form} field={field} />
      </ScrollView>
      {/* Pinned to the bottom as an overlay, so only the dock's own
          transform moves it. Positioned with style, since Uniwind's
          className only reaches React Native's own components. */}
      <KeyboardDock
        style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
      >
        <View className="px-5 pt-3 pb-safe-offset-2">
          <Button
            label={copy.addressContinue}
            loading={form.checking}
            disabled={form.empty}
            onPress={() => void form.submit()}
          />
        </View>
      </KeyboardDock>
    </View>
  )
}
