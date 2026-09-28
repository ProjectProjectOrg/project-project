import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Result from "effect/Result"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { useFocusEffect } from "expo-router"
import { type ComponentRef, useCallback, useRef, useState } from "react"
import { type TextInput, View } from "react-native"
import {
  KeyboardAwareScrollView,
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
  // The footer already pads for the home indicator, so it rises by the
  // keyboard minus that inset and sits the same 8 pt above the keyboard.
  const { bottom } = useSafeAreaInsets()

  useFocusEffect(
    useCallback(() => {
      field.current?.focus()
      return () => {
        attempt.current += 1
      }
    }, [])
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
    if (Result.isFailure(origin)) return
    const current = ++attempt.current
    const exit = await check(origin.success)
    if (current === attempt.current && Exit.isSuccess(exit)) onChecked()
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
      <KeyboardAwareScrollView
        mode="layout"
        className="flex-1"
        contentContainerClassName="px-5 pt-4"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="headline">{copy.addressTitle}</Text>
        <Text variant="muted" className="mt-2">
          {copy.addressBody}
        </Text>
        <View className="mt-6">
          <TextField
            label={copy.addressLabel}
            placeholder={copy.addressPlaceholder}
            mono
            value={address}
            onChangeText={edit}
            onSubmitEditing={() => void submit()}
            editable={!checkState.waiting}
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
      </KeyboardAwareScrollView>
      <KeyboardStickyView
        offset={{ opened: bottom }}
        className="px-5 pt-3 pb-safe-offset-2"
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
