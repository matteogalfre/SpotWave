import React, { Component, ErrorInfo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Appearance } from 'react-native';
import { log } from '../utils/logger';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; key: number; }

const DARK = { bg: '#0B0F1A', text: '#EAEEF6', textDim: 'rgba(234,238,246,0.5)', accent: '#00D4AA', btnTxt: '#0B0F1A' };
const LIGHT = { bg: '#F5F5F5', text: '#1A1A2E', textDim: 'rgba(26,26,46,0.5)', accent: '#00B894', btnTxt: '#FFFFFF' };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, key: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error('Uncaught error:', error?.message, info.componentStack);
  }

  reset = () => this.setState(prev => ({ hasError: false, error: null, key: prev.key + 1 }));

  render() {
    if (this.state.hasError) {
      const c = Appearance.getColorScheme() === 'light' ? LIGHT : DARK;
      return (
        <View style={[s.root, { backgroundColor: c.bg }]}>
          <Text style={s.emoji}>😵</Text>
          <Text style={[s.title, { color: c.text }]}>Oops</Text>
          <Text style={[s.msg, { color: c.textDim }]}>{this.state.error?.message ?? 'Something went wrong'}</Text>
          <TouchableOpacity style={[s.btn, { backgroundColor: c.accent }]} onPress={this.reset} activeOpacity={0.8} accessibilityRole="button">
            <Text style={[s.btnTxt, { color: c.btnTxt }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return <React.Fragment key={this.state.key}>{this.props.children}</React.Fragment>;
  }
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  msg: { fontSize: 13, textAlign: 'center', marginBottom: 24 },
  btn: { borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 },
  btnTxt: { fontSize: 15, fontWeight: '800' },
});
