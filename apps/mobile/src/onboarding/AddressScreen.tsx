import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Result from "effect/Result"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { useFocusEffect } from "expo-router"
import { useCallback, useRef, useState } from "react"
import {
  KeyboardAvoidingView,
  ScrollView,
  type TextInput,
  View
} from "react-native"

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
  const field = useRef<TextInput>(null)
  const [address, setAddress] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const origin = normalizeAddress(address, __DEV__)

  useFocusEffect(useCallback(() => field.current?.focus(), []))

  const edit = (next: string) => {
    setAddress(next)
    setSubmitted(false)
    resetCheck(Atom.Reset)
  }

  const submit = async () => {
    setSubmitted(true)
    if (Result.isFailure(origin)) return
    const exit = await check(origin.success)
    if (Exit.isSuccess(exit)) onChecked()
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
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-background">
      <ScrollView
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
      </ScrollView>
      <View className="px-5 pt-3 pb-safe-offset-2">
        <Button
          label={copy.addressContinue}
          loading={checkState.waiting}
          disabled={address.trim().length === 0}
          onPress={() => void submit()}
        />
      </View>
    </KeyboardAvoidingView>
  )
}
