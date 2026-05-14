import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function AppearanceSettingsScreen() {
  const router = useRouter();
  const { colors: c, mode, setMode, isDark } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.topbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={c.primary} />
        </TouchableOpacity>
        <Text style={[styles.topbarTitle, { color: c.text }]}>Görünüm</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconWrap, { backgroundColor: '#7C3AED22' }]}>
              <Ionicons name="color-palette-outline" size={20} color="#7C3AED" />
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Tema</Text>
              <Text style={[styles.cardSub, { color: c.textFaint }]}>Otomatik: 07:00–19:59 açık, 20:00–06:59 koyu</Text>
            </View>
          </View>

          <View style={styles.segmentRow}>
            {([
              ['light',  '☀️', 'Açık'],
              ['system', '⚙️', 'Otomatik'],
              ['dark',   '🌙', 'Koyu'],
            ] as const).map(([m, emoji, label]) => (
              <TouchableOpacity key={m} onPress={() => setMode(m)}
                style={[
                  styles.segmentBtn,
                  {
                    borderColor: mode === m ? '#7C3AED' : c.border,
                    backgroundColor: mode === m ? '#7C3AED18' : c.surfaceAlt,
                  },
                ]}>
                <Text style={styles.segmentEmoji}>{emoji}</Text>
                <Text style={[styles.segmentLabel, {
                  color: mode === m ? '#7C3AED' : c.textMuted,
                  fontWeight: mode === m ? '600' : '400',
                }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  topbar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 52, paddingBottom: 12, borderBottomWidth: 0.5 },
  topbarTitle:  { fontSize: 16, fontWeight: '600' },
  content:      { padding: 14, gap: 12 },
  card:         { borderRadius: 16, padding: 16, gap: 16 },
  cardHeader:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap:     { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardHeaderText: { flex: 1 },
  cardTitle:    { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  cardSub:      { fontSize: 12, lineHeight: 17 },
  segmentRow:   { flexDirection: 'row', gap: 8 },
  segmentBtn:   { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, gap: 4 },
  segmentEmoji: { fontSize: 18 },
  segmentLabel: { fontSize: 12 },
});
