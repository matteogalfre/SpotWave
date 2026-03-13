import React, { Component, ErrorInfo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[SpotWave] Uncaught error:', error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      return (
        <View style={s.root}>
          <Text style={s.emoji}>😵</Text>
          <Text style={s.title}>Oups, quelque chose a planté</Text>
          <Text style={s.msg}>{this.state.error?.message ?? 'Erreur inconnue'}</Text>
          <TouchableOpacity style={s.btn} onPress={this.reset} activeOpacity={0.8}>
            <Text style={s.btnTxt}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0F1A', justifyContent: 'center', alignItems: 'center', padding: 32 },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { color: '#EAEEF6', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  msg: { color: 'rgba(234,238,246,0.5)', fontSize: 13, textAlign: 'center', marginBottom: 24 },
  btn: { backgroundColor: '#00D4AA', borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 },
  btnTxt: { color: '#0B0F1A', fontSize: 15, fontWeight: '800' },
});
