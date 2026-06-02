import React, { useEffect, useRef, useCallback, useState, createContext, useContext } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Pressable, AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, ThemePalette } from '../context/ThemeContext';
import { useNetwork } from '../context/NetworkContext';
import { OFFLINE_BANNER_HEIGHT } from './OfflineBanner';
import { useI18n } from '../i18n';
import { spacing, radius, typography, touchTarget } from '../utils/tokens';

type ToastType = 'success' | 'error' | 'info';

interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
  durationMs: number;
}

interface ShowOptions {
  action?: ToastAction;
  durationMs?: number;
}

interface ToastContextType {
  show: (message: string, type?: ToastType, options?: ShowOptions) => void;
}

const ToastContext = createContext<ToastContextType>({ show: () => {} });

export function useToast() { return useContext(ToastContext); }

const DEFAULT_DURATION_MS: Record<ToastType, number> = {
  success: 2500,
  info: 2500,
  error: 4000,
};

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { offline } = useNetwork();

  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback((message: string, type: ToastType = 'info', options?: ShowOptions) => {
    const id = ++toastId;
    const durationMs = options?.durationMs ?? (options?.action ? 5000 : DEFAULT_DURATION_MS[type]);
    const item: ToastItem = { id, message, type, action: options?.action, durationMs };
    setToasts(prev => [...prev, item]);
    AccessibilityInfo.announceForAccessibility?.(message);
    const timer = setTimeout(() => dismiss(id), durationMs);
    timersRef.current.set(id, timer);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View
        style={[s.container, { top: insets.top + spacing.sm + (offline ? OFFLINE_BANNER_HEIGHT : 0) }]}
        pointerEvents="box-none"
      >
        {toasts.map(t => (
          <ToastBubble
            key={t.id}
            item={t}
            colors={colors}
            onDismiss={() => dismiss(t.id)}
          />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

function ToastBubble({ item, colors, onDismiss }: {
  item: ToastItem;
  colors: ThemePalette;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const anim = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(-30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(anim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
    const exitTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slide, { toValue: -30, duration: 200, useNativeDriver: true }),
      ]).start();
    }, Math.max(item.durationMs - 200, 0));
    return () => clearTimeout(exitTimer);
  }, [anim, slide, item.durationMs]);

  const bgMap = {
    success: `${colors.accent}F2`,
    error: `${colors.red}F2`,
    info: `${colors.blue}F2`,
  };
  const bg = bgMap[item.type];

  const handleAction = () => {
    item.action?.onPress();
    onDismiss();
  };

  return (
    <Animated.View
      style={[s.toast, { backgroundColor: bg, opacity: anim, transform: [{ translateY: slide }] }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Pressable
        onPress={onDismiss}
        style={s.toastBody}
        accessibilityRole="button"
        accessibilityLabel={t.dismiss}
        accessibilityHint={item.message}
      >
        <Text style={s.toastTxt}>{item.message}</Text>
      </Pressable>
      {item.action && (
        <TouchableOpacity
          onPress={handleAction}
          style={s.actionBtn}
          accessibilityRole="button"
          accessibilityLabel={item.action.label}
        >
          <Text style={s.actionTxt}>{item.action.label}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: { position: 'absolute', left: spacing.lg, right: spacing.lg, zIndex: 9999, alignItems: 'center', gap: 6 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: touchTarget.min,
    maxWidth: 360,
  },
  toastBody: { flex: 1, paddingVertical: spacing.sm + 2 },
  toastTxt: { ...typography.bodyBold, color: '#fff', textAlign: 'center' },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginLeft: spacing.sm,
    minHeight: touchTarget.min,
    justifyContent: 'center',
  },
  actionTxt: { ...typography.bodyBold, color: '#fff', textDecorationLine: 'underline' },
});
