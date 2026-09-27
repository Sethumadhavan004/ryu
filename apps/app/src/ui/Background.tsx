import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { C } from "../theme";

/** The void (native): layered gradients; the web build adds grid + motes. */
export function Background({ recording }: { recording: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: C.abyss }]} />
      <LinearGradient
        colors={recording ? ["rgba(60,34,140,0.55)", "rgba(10,6,30,0.2)", C.abyss] : ["rgba(20,62,150,0.5)", "rgba(6,20,52,0.25)", C.abyss]}
        start={{ x: 0.5, y: 0.2 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
