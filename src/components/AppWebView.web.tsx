import React, { forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import type { WebViewProps } from 'react-native-webview';
import type { AppWebViewHandle } from './AppWebView';

/**
 * Web replacement for react-native-webview. The map screen builds a full Leaflet
 * HTML document and drives it imperatively; on web we render that document in a
 * same-origin <iframe srcDoc> and reproduce the two bridge primitives the app
 * relies on:
 *   - injectJavaScript(js)  -> eval in the iframe's window (functions like
 *     setUserLocation / updateSpot live there).
 *   - onMessage             -> the HTML posts to window.parent; we forward it.
 * The HTML's sendMsg() already falls back to window.parent.postMessage when
 * ReactNativeWebView is absent (see buildMapHtml).
 */
const AppWebView = forwardRef<AppWebViewHandle, WebViewProps>((props, ref) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onMessageRef = useRef(props.onMessage);
  onMessageRef.current = props.onMessage;

  useImperativeHandle(ref, () => ({
    injectJavaScript: (js: string) => {
      try {
        // srcDoc iframes are same-origin, so eval in the child window works and
        // resolves against the functions the Leaflet document defined.
        (iframeRef.current?.contentWindow as any)?.eval(js);
      } catch {
        // Ignore: mirrors react-native-webview's best-effort injection.
      }
    },
  }));

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const cb = onMessageRef.current as ((ev: { nativeEvent: { data: string } }) => void) | undefined;
      if (cb) cb({ nativeEvent: { data: String(e.data) } });
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const html = (props.source as { html?: string })?.html ?? '';

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      title="map"
      onLoad={() => props.onLoadEnd?.({} as any)}
      style={{ flex: 1, width: '100%', height: '100%', border: 'none', display: 'block' }}
    />
  );
});

AppWebView.displayName = 'AppWebView';
export default AppWebView;
