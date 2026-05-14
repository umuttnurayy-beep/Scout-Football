import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import {
  DEFAULT_PREFS, NotifPrefs, cancelAllNotifications,
  loadNotifPrefs, registerPushToken, requestPermissions, saveNotifPrefs,
} from '../services/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function NotificationsSettingsScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({ ...DEFAULT_PREFS });

  useEffect(() => {
    loadNotifPrefs().then(setNotifPrefs);
  }, []);

  async function togglePref(key: keyof NotifPrefs, val: boolean) {
    const updated = { ...notifPrefs, [key]: val };
    const anyEnabled = updated.daily || updated.favTeam || updated.featured;
    if (val && anyEnabled) {
      const granted = await requestPermissions();
      if (!granted) {
        Alert.alert('Bildirim izni gerekli', 'Lütfen uygulama ayarlarından bildirim iznini etkinleştirin.');
        return;
      }
    }
    if (!anyEnabled) await cancelAllNotifications();
    setNotifPrefs(updated);
    await saveNotifPrefs(updated);
    if (anyEnabled) {
      const favRaw = await AsyncStorage.getItem('scout_fav_team');
      const wlRaw = await AsyncStorage.getItem('scout_watchlist');
      const fav = favRaw ? JSON.parse(favRaw) : null;
      const wl = wlRaw ? JSON.parse(wlRaw) : [];
      const watched = [fav?.name, ...wl.map((t: any) => t.name)].filter(Boolean) as string[];
      await registerPushToken(updated, watched);
    }
  }

  const items: { key: keyof NotifPrefs; label: string; sub: string; icon: string; color: string }[] = [
    { key: 'daily',    label: 'Günlük analiz bildirimi', sub: 'Her gün "Bugünün analizleri hazır"',                     icon: 'sunny-outline',          color: '#E6A817' },
    { key: 'favTeam',  label: 'Maç hatırlatması',        sub: 'Favori ve takip listesi, maçtan 30 dk önce',             icon: 'heart-outline',          color: '#F85149' },
    { key: 'featured', label: 'Öne çıkan maçlar',        sub: 'Günün en yüksek puanlı maçı',                            icon: 'star-outline',           color: '#0891B2' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.topbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={c.primary} />
        </TouchableOpacity>
        <Text style={[styles.topbarTitle, { color: c.text }]}>Bildirimler</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          {items.map((item, i) => (
            <View key={item.key}>
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: `${item.color}18` }]}>
                  <Ionicons name={item.icon as any} size={18} color={item.color} />
                </View>
                <View style={styles.labelWrap}>
                  <Text style={[styles.label, { color: c.text }]}>{item.label}</Text>
                  <Text style={[styles.sub, { color: c.textFaint }]}>{item.sub}</Text>
                </View>
                <Switch
                  value={notifPrefs[item.key]}
                  onValueChange={v => togglePref(item.key, v)}
                  trackColor={{ false: c.border, true: c.primary }}
                  thumbColor={c.surface}
                />
              </View>
              {i < items.length - 1 && <View style={[styles.divider, { backgroundColor: c.borderLight }]} />}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1 },
  topbar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 12, borderBottomWidth: 0.5 },
  topbarTitle:{ fontSize: 16, fontWeight: '600' },
  content:    { padding: 14 },
  card:       { borderRadius: 16, overflow: 'hidden' },
  row:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  iconWrap:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  labelWrap:  { flex: 1 },
  label:      { fontSize: 14, fontWeight: '500' },
  sub:        { fontSize: 12, marginTop: 2, lineHeight: 16 },
  divider:    { height: 0.5, marginLeft: 64 },
});
