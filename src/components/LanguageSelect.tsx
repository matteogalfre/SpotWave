import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import { useI18n, Locale } from '../i18n';
import { spacing, radius, typography, touchTarget } from '../utils/tokens';

const hapticLight = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

const LANGS: { locale: Locale; label: string; flag: string }[] = [
  { locale: 'fr', label: 'Français', flag: '🇫🇷' },
  { locale: 'en', label: 'English', flag: '🇬🇧' },
  { locale: 'es', label: 'Español', flag: '🇪🇸' },
  { locale: 'pt', label: 'Português', flag: '🇵🇹' },
];

/**
 * Compact, clean language dropdown. Shows the active language as a pill and
 * opens a small modal sheet to pick another. Used in onboarding and profile.
 */
export default function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);

  const current = LANGS.find(l => l.locale === locale) ?? LANGS[1];

  const pick = (l: Locale) => {
    hapticLight();
    setLocale(l);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[
          s.trigger,
          { backgroundColor: colors.card, borderColor: colors.border },
          compact && s.triggerCompact,
        ]}
        onPress={() => { hapticLight(); setOpen(true); }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={current.label}
        accessibilityHint="Change language"
      >
        <Text style={s.flag}>{current.flag}</Text>
        <Text style={[s.triggerTxt, { color: colors.white }]}>{current.label}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {LANGS.map((l, i) => {
              const active = l.locale === locale;
              return (
                <TouchableOpacity
                  key={l.locale}
                  style={[
                    s.row,
                    { borderBottomColor: colors.border },
                    i === LANGS.length - 1 && s.rowLast,
                  ]}
                  onPress={() => pick(l.locale)}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={l.label}
                >
                  <Text style={s.flag}>{l.flag}</Text>
                  <Text style={[s.rowTxt, { color: active ? colors.accent : colors.white }]}>{l.label}</Text>
                  {active && <Ionicons name="checkmark" size={20} color={colors.accent} />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    minHeight: touchTarget.min,
    alignSelf: 'center',
  },
  triggerCompact: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 38,
  },
  triggerTxt: { ...typography.h3, fontSize: 15 },
  flag: { fontSize: 18 },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLast: { borderBottomWidth: 0 },
  rowTxt: { ...typography.h3, fontSize: 16, flex: 1 },
});
