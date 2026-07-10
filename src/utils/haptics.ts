import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Haptic feedback is a native-only affordance. On the web (PWA) it either does
// nothing (iOS Safari) or triggers an unwanted buzz via the Vibration API on
// some Android browsers — so we hard-disable it there. Native keeps the feel.
const enabled = Platform.OS !== 'web';

export const hapticLight = () => {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

export const hapticMedium = () => {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};

export const hapticSuccess = () => {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};
