import React, { useEffect, useRef, useCallback, useState, createContext, useContext } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextType {
  show: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType>({ show: () => {} });

export function useToast() { return useContext(ToastContext); }

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const insets = useSafeAreaInsets();

  const show = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View style={[s.container, { top: insets.top + 8 }]} pointerEvents="none">
        {toasts.map(t => <ToastBubble key={t.id} item={t} />)}
      </View>
    </ToastContext.Provider>
  );
}

function ToastBubble({ item }: { item: ToastItem }) {
  const anim = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(-30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(anim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slide, { toValue: -30, duration: 200, useNativeDriver: true }),
      ]).start();
    }, 2000);
    return () => clearTimeout(timer);
  }, [anim, slide]);

  const bg = item.type === 'success' ? 'rgba(0,212,170,0.95)' : item.type === 'error' ? 'rgba(255,90,90,0.95)' : 'rgba(74,144,255,0.95)';

  return (
    <Animated.View style={[s.toast, { backgroundColor: bg, opacity: anim, transform: [{ translateY: slide }] }]}>
      <Text style={s.toastTxt}>{item.message}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: { position: 'absolute', left: 16, right: 16, zIndex: 9999, alignItems: 'center', gap: 6 },
  toast: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, maxWidth: 340 },
  toastTxt: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
