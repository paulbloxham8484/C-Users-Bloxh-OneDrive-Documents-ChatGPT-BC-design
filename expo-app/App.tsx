import { createElement, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

export default function App() {
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let mounted = true;
    document.title = 'BC Design | Bloxham Building & Construction';
    // Retire only this app's earlier root worker when adopting the same local origin.
    // Project localStorage and all saved model data are left intact.
    const prepare = async () => {
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            const worker = registration.active || registration.waiting || registration.installing;
            if (worker && new URL(worker.scriptURL).pathname === '/sw.js' && registration.scope === location.origin + '/') await registration.unregister();
          }
        }
      } catch { /* The workspace also runs when service workers are unavailable. */ }
      if (mounted) setReady(true);
    };
    void prepare();
    return () => { mounted = false; };
  }, []);
  if (Platform.OS !== 'web') return <View style={styles.container}><Text>Open BC Design in the Surface web preview.</Text></View>;
  return (
    <View style={styles.container} testID="bc-design-expo-shell">
      {(!loaded || error) && <Text style={styles.message} accessibilityRole="alert">{error || 'Opening BC Design…'}</Text>}
      {ready && createElement('iframe', {
        id: 'bc-design-workspace',
        title: 'BC Design measured building workspace',
        src: './workspace/index.html?build=framing45',
        style: { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, display: 'block' },
        onLoad: () => { setLoaded(true); setError(''); },
        onError: () => setError('The drawing workspace could not open. Restart the local preview and try again.'),
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#1c6243',
  },
  message: { position: 'absolute', top: 20, left: 20, color: '#fff', zIndex: 1 },
});
