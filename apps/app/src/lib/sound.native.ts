import * as Haptics from "expo-haptics";
import { useRyu } from "../state/store";

/** Native: the System speaks through haptics instead of synthesized tones. */
export const sound = {
  unlock() {},
  play(kind: "open" | "notice" | "rec" | "stop" | "done" | "error") {
    if (!useRyu.getState().soundOn) return;
    const map = {
      open: () => Haptics.selectionAsync(),
      notice: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
      rec: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
      stop: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
      done: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    };
    void map[kind]().catch(() => {});
  },
};
