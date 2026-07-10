import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { WebView, WebViewProps } from 'react-native-webview';

/**
 * Thin wrapper around react-native-webview so the rest of the app depends on a
 * single, platform-stable surface. The web build swaps this file for
 * AppWebView.web.tsx (an <iframe> shim), since react-native-webview has no web
 * support. Only the API actually used by the app is exposed on the ref.
 */
export type AppWebViewHandle = {
  injectJavaScript: (js: string) => void;
};

const AppWebView = forwardRef<AppWebViewHandle, WebViewProps>((props, ref) => {
  const inner = useRef<WebView>(null);
  useImperativeHandle(ref, () => ({
    injectJavaScript: (js: string) => inner.current?.injectJavaScript(js),
  }));
  return <WebView ref={inner} {...props} />;
});

AppWebView.displayName = 'AppWebView';
export default AppWebView;
