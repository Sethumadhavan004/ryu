import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { C, F, glow, textGlow, web } from "../theme";
import { TONE, type Tone } from "./SystemWindow";

interface Props {
  label: string;
  onPress?: () => void;
  tone?: Tone;
  size?: "lg" | "md" | "sm";
  /** Small line under the label, e.g. the voice equivalent: “or say …” */
  hint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Touch twin for every voice action (Research 04 principle 3). */
export function SystemButton({ label, onPress, tone = "system", size = "md", hint, disabled, style, testID }: Props) {
  const t = TONE[tone];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={(state) => {
        const { pressed } = state;
        const hovered = (state as { hovered?: boolean }).hovered;
        return [
          styles.btn,
          size === "lg" && styles.lg,
          size === "sm" && styles.sm,
          {
            borderColor: t.line,
            backgroundColor: hovered ? "rgba(77,163,255,0.16)" : "rgba(8,22,52,0.55)",
            boxShadow: hovered ? glow(t.glow, 26) : glow(t.glow, 12, false),
            opacity: disabled ? 0.4 : 1,
            transform: [{ scale: pressed ? 0.975 : 1 }],
          },
          web({ transition: "background-color 180ms ease, box-shadow 220ms ease, transform 120ms ease", cursor: disabled ? "default" : "pointer", backdropFilter: "blur(8px)" }),
          style,
        ];
      }}
    >
      <View style={[styles.bar, { backgroundColor: t.hi }]} />
      <View style={{ alignItems: "center" }}>
        <Text style={[styles.label, size === "lg" && styles.labelLg, size === "sm" && styles.labelSm, { color: C.ice }, textGlow(t.glow, 8)]}>{label.toUpperCase()}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={[styles.bar, { backgroundColor: t.hi }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, borderWidth: 1, paddingVertical: 11, paddingHorizontal: 20, borderRadius: 2 },
  lg: { paddingVertical: 15, paddingHorizontal: 30 },
  sm: { paddingVertical: 7, paddingHorizontal: 12, gap: 8 },
  bar: { width: 3, height: 3, transform: [{ rotate: "45deg" }], opacity: 0.9 },
  label: { fontFamily: F.display, fontSize: 13, letterSpacing: 3 },
  labelLg: { fontSize: 15, letterSpacing: 4 },
  labelSm: { fontSize: 10.5, letterSpacing: 2.2 },
  hint: { fontFamily: F.body, fontSize: 11, color: C.muted, marginTop: 3, letterSpacing: 0.2 },
});
