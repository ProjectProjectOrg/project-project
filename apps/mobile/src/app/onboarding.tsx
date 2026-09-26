import { Button, Column, Host, Text } from "@expo/ui"
import { GlassView } from "expo-glass-effect"
import { router } from "expo-router"
import { StyleSheet, View } from "react-native"

import { copy } from "@/copy"

export default function Onboarding() {
  return (
    <View style={styles.screen}>
      <GlassView style={styles.card} glassEffectStyle="regular">
        <Host matchContents>
          <Column spacing={12} alignment="center">
            <Text textStyle={{ fontSize: 22, fontWeight: "600" }}>
              {copy.welcomeTitle}
            </Text>
            <Text textStyle={{ textAlign: "center" }}>{copy.welcomeBody}</Text>
            <Button
              variant="filled"
              label={copy.welcomeStart}
              onPress={() => router.push("/sign-in")}
            />
          </Column>
        </Host>
      </GlassView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 24 },
  card: { borderRadius: 28, padding: 24 }
})
