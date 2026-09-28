import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Result from "effect/Result"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Haptics from "expo-haptics"
import {
  type NativeStackNavigationProp,
  useFocusEffect,
  useNavigation
} from "expo-router"
import {
  type ComponentRef,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react"
import { ScrollView, type TextInput, View } from "react-native"
import {
  KeyboardController,
  KeyboardStickyView
} from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { TextField } from "@/components/ui/text-field"
import { copy } from "@/copy"

import { normalizeAddress } from "./address"
import { checkServerAtom } from "./atoms"

const serverProblem = AsyncResult.matchWithError({
  onInitial: () => null,
  onSuccess: () => null,
  onError: (error: { problem: keyof typeof copy.serverProblems }) =>
    copy.serverProblems[error.problem],
  onDefect: () => copy.checkFailed
})

export function AddressScreen({
  onChecked
}: Readonly<{ onChecked: () => void }>) {
  const check = useAtomSet(checkServerAtom, { mode: "promiseExit" })
  const resetCheck = useAtomSet(checkServerAtom)
  const checkState = useAtomValue(checkServerAtom)
  const field = useRef<ComponentRef<typeof TextInput>>(null)
  const attempt = useRef(0)
  const [address, setAddress] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const origin = normalizeAddress(address, __DEV__)
  // The footer pads for the home indicator, which the keyboard covers, so it
  // rises by the keyboard minus that inset and keeps 8 pt above the keyboard.
  const { bottom } = useSafeAreaInsets()

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
    [navigation]
  )
  useFocusEffect(
    useCallback(
      () => () => {
        attempt.current += 1
      },
      []
    )
  )

  const edit = (next: string) => {
    setAddress(next)
    setSubmitted(false)
    attempt.current += 1
    resetCheck(Atom.Interrupt)
    resetCheck(Atom.Reset)
  }

  const submit = async () => {
    setSubmitted(true)
    if (Result.isFailure(origin)) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }
    const current = ++attempt.current
    const exit = await check(origin.success)
    if (current !== attempt.current) return
    void Haptics.notificationAsync(
      Exit.isSuccess(exit)
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error
    )
    if (Exit.isSuccess(exit)) {
      // Lower the keyboard with the push. Otherwise it stays up until this
      // screen leaves the window, after the transition.
      void KeyboardController.dismiss()
      onChecked()
    }
  }

  const error =
    submitted && Result.isFailure(origin)
      ? copy.addressProblems[origin.failure]
      : serverProblem(checkState)
  const hint = Result.isSuccess(origin)
    ? origin.success.startsWith("http:")
      ? copy.addressInsecure
      : copy.addressResolves(origin.success)
    : null

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pt-4"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Text variant="headline">{copy.addressTitle}</Text>
        <Text variant="muted" className="mt-2">
          {copy.addressBody}
        </Text>
        <View className="mt-6">
          {/* Return checks the address and keeps the keyboard up. The field
              stays editable during a check, since typing cancels it and
              disabling a focused field would drop the keyboard. */}
          <TextField
            label={copy.addressLabel}
            placeholder={copy.addressPlaceholder}
            mono
            value={address}
            onChangeText={edit}
            onSubmitEditing={() => void submit()}
            submitBehavior="submit"
            ref={field}
            keyboardType="url"
            textContentType="URL"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="url"
            returnKeyType="go"
            error={error}
            hint={hint}
          />
        </View>
      </ScrollView>
      {/* An overlay pinned to the bottom, so only the sticky view's own
          transform moves it and no layout change adds to that. */}
      <KeyboardStickyView
        offset={{ closed: 0, opened: bottom }}
        className="absolute inset-x-0 bottom-0 px-5 pt-3 pb-safe-offset-2"
      >
        <Button
          label={copy.addressContinue}
          loading={checkState.waiting}
          disabled={address.trim().length === 0}
          onPress={() => void submit()}
        />
      </KeyboardStickyView>
    </View>
  )
}
