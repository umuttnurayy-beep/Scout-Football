import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export type ActiveTab = 'matches' | 'leagues' | 'stats' | 'profile';

const TABS: { key: ActiveTab; label: string; icon: string; activeIcon: string; route: string }[] = [
  { key: 'matches',  label: 'Maçlar',     icon: 'football-outline',    activeIcon: 'football',    route: '/' },
  { key: 'leagues',  label: 'Ligler',     icon: 'trophy-outline',      activeIcon: 'trophy',      route: '/leagues' },
  { key: 'stats',    label: 'İstatistik', icon: 'stats-chart-outline', activeIcon: 'stats-chart', route: '/stats' },
  { key: 'profile',  label: 'Profil',     icon: 'person-outline',      activeIcon: 'person',      route: '/profile' },
];

export default function BottomTabBar({ activeTab }: { activeTab: ActiveTab }) {
  const router = useRouter();
  const { colors: c } = useTheme();

  return (
    <View style={[styles.tabBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
      {TABS.map(tab => {
        const isActive = tab.key === activeTab;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => { if (!isActive) router.push(tab.route as any); }}
          >
            <Ionicons
              name={(isActive ? tab.activeIcon : tab.icon) as any}
              size={22}
              color={isActive ? c.primary : c.textMuted}
            />
            <Text style={[styles.tabText, { color: isActive ? c.primary : c.textMuted }, isActive && styles.tabActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar:    { flexDirection: 'row', borderTopWidth: 0.5, paddingBottom: 20 },
  tab:       { flex: 1, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabText:   { fontSize: 12 },
  tabActive: { fontWeight: '500' },
});
