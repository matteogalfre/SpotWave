import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TextInput, TouchableOpacity, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticSuccess } from '../utils/haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n';
import { useToast } from './Toast';
import { submitSpotSuggestion, SkillLevel } from '../services/suggestSpot';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const LEVELS: SkillLevel[] = ['Beginner', 'Intermediate', 'Expert'];

export default function SuggestSpotModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { show: showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [level, setLevel] = useState<SkillLevel | ''>('');
  const [webcam, setWebcam] = useState('');
  const [sending, setSending] = useState(false);

  const reset = () => { setName(''); setCountry(''); setLevel(''); setWebcam(''); };
  const close = () => { if (!sending) { reset(); onClose(); } };

  const send = async () => {
    if (!name.trim() || !country.trim()) {
      showToast(t.suggestRequired, 'info');
      return;
    }
    setSending(true);
    const ok = await submitSpotSuggestion({ name, country, level, webcam });
    setSending(false);
    if (ok) {
      hapticSuccess();
      showToast(t.suggestThanks, 'success');
      reset();
      onClose();
    } else {
      showToast(t.suggestError, 'error');
    }
  };

  const levelLabel = (l: SkillLevel) =>
    l === 'Beginner' ? t.levelBeginner : l === 'Intermediate' ? t.levelIntermediate : t.levelExpert;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={s.backdrop} onPress={close}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.kav}>
          <Pressable style={[s.sheet, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
            <View style={s.handle} />
            <Text style={[s.title, { color: colors.white }]}>{t.suggestTitle}</Text>
            <Text style={[s.sub, { color: colors.white40 }]}>{t.suggestSubtitle}</Text>

            <Text style={[s.label, { color: colors.white70 }]}>{t.suggestName} *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t.suggestNamePh}
              placeholderTextColor={colors.white40}
              style={[s.input, { backgroundColor: colors.card, color: colors.white, borderColor: colors.white15 }]}
            />

            <Text style={[s.label, { color: colors.white70 }]}>{t.suggestCountry} *</Text>
            <TextInput
              value={country}
              onChangeText={setCountry}
              placeholder={t.suggestCountryPh}
              placeholderTextColor={colors.white40}
              style={[s.input, { backgroundColor: colors.card, color: colors.white, borderColor: colors.white15 }]}
            />

            <Text style={[s.label, { color: colors.white70 }]}>{t.suggestLevel}</Text>
            <View style={s.segRow}>
              {LEVELS.map(l => {
                const active = level === l;
                return (
                  <TouchableOpacity
                    key={l}
                    onPress={() => setLevel(active ? '' : l)}
                    activeOpacity={0.8}
                    style={[s.seg, { backgroundColor: active ? colors.accent : colors.card, borderColor: active ? colors.accent : colors.white15 }]}
                  >
                    <Text style={[s.segTxt, { color: active ? colors.onAccent : colors.white70 }]}>{levelLabel(l)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[s.label, { color: colors.white70 }]}>{t.suggestWebcam}</Text>
            <TextInput
              value={webcam}
              onChangeText={setWebcam}
              placeholder={t.suggestWebcamPh}
              placeholderTextColor={colors.white40}
              autoCapitalize="none"
              keyboardType="url"
              style={[s.input, { backgroundColor: colors.card, color: colors.white, borderColor: colors.white15 }]}
            />

            <TouchableOpacity
              onPress={send}
              disabled={sending}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t.suggestSend}
              style={[s.send, { backgroundColor: colors.accent, opacity: sending ? 0.7 : 1 }]}
            >
              {sending
                ? <ActivityIndicator size="small" color={colors.onAccent} />
                : <><MaterialCommunityIcons name="send" size={16} color={colors.onAccent} /><Text style={[s.sendTxt, { color: colors.onAccent }]}>{t.suggestSend}</Text></>}
            </TouchableOpacity>

            <TouchableOpacity onPress={close} style={s.cancel} accessibilityRole="button">
              <Text style={[s.cancelTxt, { color: colors.white40 }]}>{t.rateCancel}</Text>
            </TouchableOpacity>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  kav: { width: '100%' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  sub: { fontSize: 12, fontWeight: '500', textAlign: 'center', marginTop: 8, marginBottom: 8, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: { height: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 14 },
  segRow: { flexDirection: 'row', gap: 8 },
  seg: { flex: 1, height: 42, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  segTxt: { fontSize: 13, fontWeight: '700' },
  send: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14, marginTop: 18 },
  sendTxt: { fontSize: 15, fontWeight: '800' },
  cancel: { alignItems: 'center', paddingVertical: 12, marginTop: 2 },
  cancelTxt: { fontSize: 13, fontWeight: '600' },
});
