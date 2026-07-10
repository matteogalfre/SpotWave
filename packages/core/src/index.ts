/**
 * @spotwave/core — platform-agnostic business logic shared by the native app
 * (Expo/React Native) and the web app (Next.js).
 *
 * HARD RULE: nothing in this package may import from `react-native`, `expo-*`,
 * `react`, or any UI/platform module. Keep it pure so both clients — and any
 * server-side rendering — can consume the exact same scoring, data and i18n.
 */
export * from './types';
export * from './theme';
export * from './scoring';
export * from './spots';
export * from './spotDescriptions';
export * from './i18n';

// The full spot database is a default export of ./spots; surface it as a named
// export too so consumers (incl. the web app) can `import { SPOTS }`.
export { default as SPOTS } from './spots';
