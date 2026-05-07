import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { useAgent } from '@/context/AgentContext';
import { PAGE_SCRIPT } from '@/agent/inject';

export default function BrowserScreen() {
  const { url, setUrl, working, registerWebView, onWebViewMessage } = useAgent();
  const [draft, setDraft] = useState(url);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const webRef = useRef<WebView>(null);
  const inputRef = useRef<TextInput>(null);
  const isDark = (useColorScheme() ?? 'light') === 'dark';

  // Register the WebView with the agent context so tools can reach it.
  // Using a callback ref guarantees we register the actual mounted instance.
  useEffect(() => {
    registerWebView(webRef.current);
    return () => registerWebView(null);
  }, [registerWebView]);

  // Keep the URL bar text in sync if the agent navigates the WebView.
  useEffect(() => {
    setDraft(url);
  }, [url]);

  function go() {
    let u = draft.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    setUrl(u);
    setDraft(u);
    Keyboard.dismiss();
  }

  function clearUrl() {
    setDraft('');
    // Keep focus so the user can immediately type a new URL.
    inputRef.current?.focus();
  }

  function dismissKeyboard() {
    Keyboard.dismiss();
  }

  function handleMessage(event: WebViewMessageEvent) {
    onWebViewMessage(event.nativeEvent.data);
  }

  const fieldBg = isDark ? '#222' : '#f0f0f0';
  const fieldText = isDark ? '#fff' : '#000';

  return (
    <View style={styles.container}>
      <RNView
        style={[
          styles.urlBar,
          { borderBottomColor: isDark ? '#333' : '#ddd' },
        ]}>
        <RNView style={[styles.urlInputWrap, { backgroundColor: fieldBg }]}>
          <TextInput
            ref={inputRef}
            style={[styles.urlInput, { color: fieldText }]}
            value={draft}
            onChangeText={setDraft}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onSubmitEditing={go}
            placeholder="https://…"
            placeholderTextColor={isDark ? '#888' : '#999'}
            returnKeyType="go"
            // selectTextOnFocus highlights the entire URL when the user taps
            // the bar — the standard mobile-browser pattern, so a single tap
            // followed by typing replaces the URL instead of inserting at
            // the caret.
            selectTextOnFocus
          />
          {draft.length > 0 && (
            <Pressable
              style={styles.clearButton}
              onPress={clearUrl}
              hitSlop={8}
              accessibilityLabel="Clear URL">
              <Text style={[styles.clearButtonText, { color: isDark ? '#bbb' : '#666' }]}>
                ×
              </Text>
            </Pressable>
          )}
        </RNView>

        {focused && (
          <Pressable onPress={dismissKeyboard} hitSlop={6} accessibilityLabel="Dismiss keyboard">
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        )}

        <Pressable style={styles.goButton} onPress={go}>
          <Text style={styles.goButtonText}>Go</Text>
        </Pressable>
      </RNView>

      {(loading || working) && <ActivityIndicator style={styles.spinner} />}

      <WebView
        ref={webRef}
        source={{ uri: url }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(navState) => {
          // Reflect in-page navigation in the URL bar without firing setUrl
          // (which would re-trigger the WebView source).
          setDraft(navState.url);
        }}
        onMessage={handleMessage}
        injectedJavaScriptBeforeContentLoaded={PAGE_SCRIPT}
        // Re-inject after every load so SPA route changes that wipe window
        // state still get the AX tree + RPC handlers.
        injectedJavaScript={PAGE_SCRIPT}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        // iOS / Android both need this for postMessage from page → RN.
        // (iOS: messagingEnabled is enabled implicitly when onMessage is set.)
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  urlBar: {
    flexDirection: 'row',
    padding: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  urlInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingRight: 4,
  },
  urlInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  clearButtonText: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '600',
  },
  doneButtonText: {
    color: '#2f95dc',
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  goButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#2f95dc',
  },
  goButtonText: { color: '#fff', fontWeight: '600' },
  spinner: { paddingVertical: 4 },
  webview: { flex: 1 },
});
